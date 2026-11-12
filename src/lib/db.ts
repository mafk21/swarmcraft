/* ============================================================================
   Storage. IndexedDB, nothing leaves the machine.
   ========================================================================== */

import { openDB, type IDBPDatabase } from 'idb';
import type { SiteSpec, SiteKind } from './spec';

const DB_NAME = 'swarmsmith';
const DB_VERSION = 1;

export type ProjectRow = {
  id: string;
  name: string;
  kind: SiteKind | null;
  created: number;
  updated: number;
  spec: SiteSpec;
};

type Schema = {
  settings: { key: string; value: unknown };
  projects: ProjectRow;
};

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('settings'))
          d.createObjectStore('settings', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('projects')) {
          const store = d.createObjectStore('projects', { keyPath: 'id' });
          store.createIndex('updated', 'updated');
        }
      },
    });
  }
  return dbp;
}

/* ── api key ─────────────────────────────────────────────────────────────── */

export async function getApiKey(): Promise<string | null> {
  const d = await db();
  const row = await d.get('settings', 'geminiKey');
  return typeof row?.value === 'string' ? row.value : null;
}

export async function setApiKey(key: string) {
  const d = await db();
  await d.put('settings', { key: 'geminiKey', value: key.trim() });
}

export async function clearApiKey() {
  const d = await db();
  await d.delete('settings', 'geminiKey');
}

/* ── projects ────────────────────────────────────────────────────────────── */

/**
 * Save a spec. Pass an existing id to update in place — that is what keeps one
 * project as one project instead of piling up duplicates every time you save.
 */
export async function saveProject(
  spec: SiteSpec,
  opts: { id?: string; kind?: SiteKind | null } = {}
): Promise<string> {
  const d = await db();
  const id = opts.id ?? crypto.randomUUID();

  const existing = opts.id ? await d.get('projects', opts.id) : undefined;

  const row: ProjectRow = {
    id,
    name: spec.meta.title,
    kind: opts.kind ?? existing?.kind ?? null,
    created: existing?.created ?? Date.now(),
    updated: Date.now(),
    spec,
  };

  await d.put('projects', row);
  return id;
}

export async function getProject(id: string): Promise<ProjectRow | undefined> {
  const d = await db();
  return d.get('projects', id);
}

export async function listProjects(): Promise<ProjectRow[]> {
  const d = await db();
  const all = await d.getAll('projects');
  // newest activity first; fall back to created for rows from before `updated`
  return all.sort((a, b) => (b.updated ?? b.created) - (a.updated ?? a.created));
}

export async function renameProject(id: string, name: string) {
  const d = await db();
  const row = await d.get('projects', id);
  if (!row) return;
  await d.put('projects', { ...row, name, updated: Date.now() });
}

export async function deleteProject(id: string) {
  const d = await db();
  await d.delete('projects', id);
}

export async function countProjects(): Promise<number> {
  const d = await db();
  return d.count('projects');
}
