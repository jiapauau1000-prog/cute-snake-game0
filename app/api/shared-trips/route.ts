import { NextResponse } from 'next/server';
import type { Trip } from '../../../src/types';
import { sql } from '../../../src/lib/db';
import { generateShareCode } from '../../../src/lib/shareCode';
import { assertTripPayloadSize, isValidTrip } from '../../../src/lib/tripValidate';

export const runtime = 'nodejs';

const recentCreates = new Map<string, { count: number; resetAt: number }>();

function rateLimitCreate(ip: string): boolean {
  const now = Date.now();
  const entry = recentCreates.get(ip);
  if (!entry || entry.resetAt < now) {
    recentCreates.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count += 1;
  return true;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
    if (!rateLimitCreate(ip)) {
      return NextResponse.json({ error: '建立過於頻繁，請稍後再試' }, { status: 429 });
    }

    const raw = await request.text();
    if (raw.length > 1_500_000) {
      return NextResponse.json({ error: '請求過大' }, { status: 413 });
    }

    const body = JSON.parse(raw) as { trip?: unknown };
    if (!isValidTrip(body.trip)) {
      return NextResponse.json({ error: '旅程資料不完整或圖片過大' }, { status: 400 });
    }

    const sizeError = assertTripPayloadSize(body.trip);
    if (sizeError) {
      return NextResponse.json({ error: sizeError }, { status: 413 });
    }

    // Soft cap: avoid unbounded table growth from one client session.
    const countRows = await sql<{ count: string | number }>(
      'select count(*)::int as count from shared_trips',
    );
    const total = Number(countRows[0]?.count ?? 0);
    if (total >= 5000) {
      return NextResponse.json({ error: '共享旅程已達上限，請稍後再試' }, { status: 429 });
    }

    let shareCode = '';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateShareCode();
      const existing = await sql<{ share_code: string }>(
        'select share_code from shared_trips where share_code = $1 limit 1',
        [candidate],
      );
      if (existing.length === 0) {
        shareCode = candidate;
        break;
      }
    }
    if (!shareCode) {
      return NextResponse.json({ error: '無法建立分享碼，請再試一次' }, { status: 500 });
    }

    const trip: Trip = {
      ...body.trip,
      shareCode,
      shared: true,
      revision: 1,
      updatedAt: new Date().toISOString(),
    };

    const rows = await sql<{
      share_code: string;
      revision: number;
      payload: Trip;
      updated_at: string;
    }>(
      `insert into shared_trips (share_code, trip_id, payload, revision, updated_at)
       values ($1, $2, $3::jsonb, 1, now())
       returning share_code, revision, payload, updated_at`,
      [shareCode, trip.id, JSON.stringify(trip)],
    );

    const row = rows[0];
    return NextResponse.json(
      {
        shareCode: row.share_code,
        revision: row.revision,
        trip: { ...row.payload, shareCode: row.share_code, shared: true, revision: row.revision },
        updatedAt: row.updated_at,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('POST /api/shared-trips', error);
    return NextResponse.json({ error: '伺服器無法建立共享旅程' }, { status: 500 });
  }
}
