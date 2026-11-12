/* ============================================================================
   Storage. IndexedDB, nothing leaves the machine.
   ========================================================================== */

import { openDB, type IDBPDatabase } from 'idb';
import type { SiteSpec } from './spec';

const DB_NAME = 'swarmsmith';
const DB_VERSION = 1;

type Schema = {
  settings: { key: string; value: unknown };
  projects: { id: string; name: string; created: number; spec: SiteSpec };
};

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('projects'))
          d.createObjectStore('projects', { keyPath: 'id' });
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

export async function saveProject(spec: SiteSpec): Promise<string> {
  const d = await db();
  const id = crypto.randomUUID();
  await d.put('projects', { id, name: spec.meta.title, created: Date.now(), spec });
  return id;
}

export async function listProjects() {
  const d = await db();
  const all = await d.getAll('projects');
  return all.sort((a, b) => b.created - a.created);
}

export async function deleteProject(id: string) {
  const d = await db();
  await d.delete('projects', id);
}
