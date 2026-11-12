import { sql } from './db';

type Bucket = { count: number; resetAt: number };

const memoryBuckets = new Map<string, Bucket>();

function memoryRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = memoryBuckets.get(key);
  if (!entry || entry.resetAt < now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

/**
 * Prefer durable Postgres counters when available so limits survive
 * deploys and apply across instances. Falls back to in-memory.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const resetAt = new Date(Date.now() + windowMs).toISOString();
  try {
    const rows = await sql<{ hit_count: number }>(
      `insert into rate_limits (bucket_key, hit_count, reset_at)
       values ($1, 1, $2::timestamptz)
       on conflict (bucket_key) do update
       set hit_count = case
             when rate_limits.reset_at <= now() then 1
             else rate_limits.hit_count + 1
           end,
           reset_at = case
             when rate_limits.reset_at <= now() then excluded.reset_at
             else rate_limits.reset_at
           end
       returning hit_count`,
      [key, resetAt],
    );
    const count = Number(rows[0]?.hit_count ?? 1);
    // Opportunistic cleanup of expired buckets (best-effort).
    if (Math.random() < 0.02) {
      void sql(`delete from rate_limits where reset_at < now() - interval '2 hours'`).catch(
        () => undefined,
      );
    }
    return count <= limit;
  } catch {
    return memoryRateLimit(key, limit, windowMs);
  }
}

/**
 * Prefer platform-provided identity headers. When using X-Forwarded-For,
 * take the rightmost hop (typically added by the trusted edge), not the
 * leftmost client-supplied value.
 */
export function clientIp(request: Request): string {
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  return 'anon';
}
