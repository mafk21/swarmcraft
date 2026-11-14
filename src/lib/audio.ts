/* ============================================================================
   The build's voice.

   Every note is synthesized here with the Web Audio API. There is not one audio
   file in this repository, which matters for three reasons: the app has no
   network dependency, nothing is licensed to anyone else, and the sound cannot
   desynchronize from the drawing because both are driven by the same clock.

   The palette is deliberately small: a mechanical key click for typing, a
   press-and-release click for the mouse, a snapped guide, tick tones while a
   heading steps up in size, and a sparse glass-piano note in E major pentatonic
   when a piece of the page lands. The pentatonic scale is what makes random
   notes sound composed rather than accidental.

   Everything is panned to the cursor that made it, so on headphones the build
   has a left and a right.
   ========================================================================== */

const SCALE = [
  // E major pentatonic, two octaves: E F# G# B C#
  329.63, 369.99, 415.3, 493.88, 554.37, 659.25, 739.99, 830.61, 987.77, 1108.73,
];

export class BuildSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** scheduled note count, so the piano grid stays sparse */
  private notes = 0;
  private muted = false;
  /** set once the context actually runs — browsers hold it until a gesture */
  private unlocked = false;

  get enabled() {
    return this.unlocked && !this.muted;
  }

  /** Browsers refuse to start audio without a user gesture. We try, and if the
      context is suspended we say so instead of pretending sound is on. */
  async start(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return false;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.unlocked = this.ctx.state === 'running';
      return this.unlocked;
    } catch {
      return false;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
    }
  }

  dispose() {
    try {
      this.ctx?.close();
    } catch {
      /* a closed context is not an error worth surfacing */
    }
    this.ctx = null;
    this.master = null;
    this.unlocked = false;
  }

  /* ── primitives ────────────────────────────────────────────────────────── */

  private out(pan = 0): { node: AudioNode } | null {
    if (!this.ctx || !this.master || !this.unlocked) return null;
    try {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.master);
      return { node: p };
    } catch {
      return { node: this.master };
    }
  }

  /** a short filtered noise burst — the body of a click */
  private noise(dur: number, freq: number, gain: number, pan: number, q = 1.2) {
    const c = this.ctx;
    const sink = this.out(pan);
    if (!c || !sink) return;
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(bp).connect(g).connect(sink.node);
    src.start();
  }

  /** one decaying sine — a note */
  private tone(freq: number, dur: number, gain: number, pan: number, type: OscillatorType = 'sine') {
    const c = this.ctx;
    const sink = this.out(pan);
    if (!c || !sink) return;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(sink.node);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /* ── the sounds ────────────────────────────────────────────────────────── */

  /** a mechanical key: sharp click over a short thock, deeper on a space */
  key(pan: number, space = false) {
    this.noise(0.03, space ? 900 : 2400, space ? 0.16 : 0.11, pan, 2.4);
    this.tone(space ? 120 : 190, 0.045, space ? 0.1 : 0.06, pan, 'triangle');
  }

  /** the mouse going down: press, then release */
  press(pan: number) {
    this.noise(0.022, 1700, 0.13, pan, 3);
    this.tone(320, 0.03, 0.05, pan, 'square');
  }

  /** a ruler guide snapping into place */
  snap(pan: number) {
    this.noise(0.018, 4200, 0.12, pan, 5);
    this.tone(1568, 0.05, 0.05, pan, 'sine');
  }

  /** a heading growing a size step */
  tick(pan: number, step: number) {
    this.tone(SCALE[Math.min(SCALE.length - 1, step + 3)], 0.06, 0.05, pan, 'triangle');
  }

  /**
   * A piece of the page landed. Sparse on purpose: not every landing gets a
   * note, or the page becomes a melody and stops sounding like work.
   */
  land(pan: number, weight: number) {
    this.notes++;
    // every third landing, roughly — deterministic so it is repeatable
    if (this.notes % 3 !== 0) return;
    const idx = Math.max(0, Math.min(SCALE.length - 1, Math.round(6 - weight * 1.4)));
    const f = SCALE[idx];
    this.tone(f, 0.9, 0.075, pan, 'sine');
    this.tone(f * 2, 0.5, 0.02, pan, 'sine');
  }

  /** the page dissolving into a blank canvas */
  dissolve() {
    this.noise(0.5, 700, 0.1, 0, 0.7);
    this.tone(220, 0.55, 0.05, 0, 'sine');
  }

  /** the swarm fanning out */
  fanfare() {
    this.tone(SCALE[2], 0.16, 0.05, -0.2, 'triangle');
    this.tone(SCALE[4], 0.2, 0.045, 0.2, 'triangle');
  }

  /** the page is done: a soft E major chord */
  finished() {
    for (const [i, f] of [SCALE[0], SCALE[2], SCALE[4], SCALE[5]].entries()) {
      setTimeout(() => this.tone(f, 1.6, 0.055, (i - 1.5) * 0.25, 'sine'), i * 55);
    }
  }
}
