// Transfer speed from successive (time, bytes) samples. Uses the measured
// interval rather than assuming a fixed polling period.
export class SpeedMeter {
  private readonly now: () => number
  private lastTime: number
  private lastBytes = 0

  constructor(now: () => number = Date.now) {
    this.now = now
    this.lastTime = now()
  }

  /** Record cumulative bytes and return bytes/second since the previous sample. */
  sample(bytes: number): number {
    const t = this.now()
    const dt = (t - this.lastTime) / 1000
    const delta = bytes - this.lastBytes
    this.lastTime = t
    this.lastBytes = bytes
    return dt > 0 && delta > 0 ? delta / dt : 0
  }
}
