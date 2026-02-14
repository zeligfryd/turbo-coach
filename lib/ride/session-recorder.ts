import type { RideSample } from "@/lib/ride/types";

export class SessionRecorder {
  private samples: RideSample[] = [];
  private startedAt: number | null = null;
  private endedAt: number | null = null;

  start(now: number = Date.now()): void {
    this.samples = [];
    this.startedAt = now;
    this.endedAt = null;
  }

  stop(now: number = Date.now()): void {
    this.endedAt = now;
  }

  addSample(sample: RideSample): void {
    this.samples.push(sample);
  }

  getSamples(): RideSample[] {
    return this.samples;
  }

  toJSON(): {
    startedAt: string | null;
    endedAt: string | null;
    samples: RideSample[];
  } {
    return {
      startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
      endedAt: this.endedAt ? new Date(this.endedAt).toISOString() : null,
      samples: this.samples,
    };
  }
}
