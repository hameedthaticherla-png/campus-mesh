/**
 * Campus Mesh — In-Memory Sliding Window Rate Limiter
 */

interface RateLimitRecord {
  timestamps: number[];
}

export class InMemoryRateLimiter {
  private records = new Map<string, RateLimitRecord>();

  /**
   * Checks if an action by a given key (e.g. IP address) exceeds maxRequests within windowMs.
   * Returns true if allowed, false if rate limited.
   */
  public checkLimit(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const record = this.records.get(key) || { timestamps: [] };

    // Clean up timestamps older than the window
    const validTimestamps = record.timestamps.filter(ts => now - ts < windowMs);

    if (validTimestamps.length >= maxRequests) {
      this.records.set(key, { timestamps: validTimestamps });
      return false; // Rate limited
    }

    validTimestamps.push(now);
    this.records.set(key, { timestamps: validTimestamps });
    return true; // Allowed
  }

  public reset(): void {
    this.records.clear();
  }
}

export const sessionCreateLimiter = new InMemoryRateLimiter();
export const sessionJoinLimiter = new InMemoryRateLimiter();
