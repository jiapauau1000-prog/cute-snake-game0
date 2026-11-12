import { NextResponse } from 'next/server';
import type { Trip } from '../../../src/types';
import { sql } from '../../../src/lib/db';
import { generateShareCode } from '../../../src/lib/shareCode';

export const runtime = 'nodejs';

function isTrip(value: unknown): value is Trip {
  if (!value || typeof value !== 'object') return false;
  const trip = value as Trip;
  return (
    typeof trip.id === 'string' &&
    typeof trip.title === 'string' &&
    typeof trip.destination === 'string' &&
    typeof trip.startDate === 'string' &&
    typeof trip.endDate === 'string' &&
    Array.isArray(trip.days)
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { trip?: unknown };
    if (!isTrip(body.trip)) {
      return NextResponse.json({ error: '旅程資料不完整' }, { status: 400 });
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
