export class ServerClock {
  private anchorTime: number;
  private anchorMonotonic: number;

  constructor(
    private monotonicNow = () => performance.now(),
    wallNow = () => Date.now(),
  ) {
    this.anchorTime = wallNow();
    this.anchorMonotonic = monotonicNow();
  }

  observeHttpDate(value: string | null): void {
    if (!value) return;
    const time = Date.parse(value);
    if (!Number.isFinite(time) || new Date(time).toUTCString() !== value) return;
    this.anchorTime = time;
    this.anchorMonotonic = this.monotonicNow();
  }

  now(): number {
    return this.anchorTime + Math.max(0, this.monotonicNow() - this.anchorMonotonic);
  }
}
export const learningClock = new ServerClock();
