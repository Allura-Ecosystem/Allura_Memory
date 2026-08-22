/**
 * Story 24.5 — Determinism providers: virtual clock and seeded RNG.
 *
 * During deterministic runs, time and randomness are virtualized so
 * replay produces identical control-flow and state digests.
 */

export class VirtualClock {
  private now: number;
  private readonly interval: number;

  constructor(startTime: string, intervalMs: number = 1000) {
    this.now = Date.parse(startTime);
    this.interval = intervalMs;
  }

  tick(count: number = 1): void {
    this.now += this.interval * count;
  }

  currentTime(): Date {
    return new Date(this.now);
  }

  isoNow(): string {
    return this.currentTime().toISOString();
  }
}

/**
 * Mulberry32 — a deterministic PRNG with a 32-bit seed.
 * Produces the same sequence across runtimes for the same seed.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}