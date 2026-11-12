import { NextResponse } from 'next/server';
import type { Trip } from '../../../../src/types';
import { sql } from '../../../../src/lib/db';
import { normalizeShareCode } from '../../../../src/lib/shareCode';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

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

export async function GET(_request: Request, context: Ctx) {
  try {
    const code = normalizeShareCode((await context.params).code);
    if (code.length < 4) {
      return NextResponse.json({ error: '分享碼無效' }, { status: 400 });
    }

    const rows = await sql<{
      share_code: string;
      revision: number;
      payload: Trip;
      updated_at: string;
    }>('select share_code, revision, payload, updated_at from shared_trips where share_code = $1', [
      code,
    ]);

    if (rows.length === 0) {
      return NextResponse.json({ error: '找不到這個分享碼' }, { status: 404 });
    }

    const row = rows[0];
    return NextResponse.json(
      {
        shareCode: row.share_code,
        revision: row.revision,
        trip: {
          ...row.payload,
          shareCode: row.share_code,
          shared: true,
          revision: row.revision,
        },
        updatedAt: row.updated_at,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('GET /api/shared-trips/[code]', error);
    return NextResponse.json({ error: '伺服器讀取失敗' }, { status: 500 });
  }
}

export async function PUT(request: Request, context: Ctx) {
  try {
    const code = normalizeShareCode((await context.params).code);
    const body = (await request.json()) as { trip?: unknown; revision?: unknown };
    if (!isTrip(body.trip) || typeof body.revision !== 'number') {
      return NextResponse.json({ error: '更新資料不完整' }, { status: 400 });
    }

    const current = await sql<{ revision: number }>(
      'select revision from shared_trips where share_code = $1',
      [code],
    );
    if (current.length === 0) {
      return NextResponse.json({ error: '找不到這個分享碼' }, { status: 404 });
    }

    // Last-write-wins for companion edits; client may pass stale revision.
    const nextRevision = Math.max(current[0].revision, body.revision) + 1;
    const trip: Trip = {
      ...body.trip,
      shareCode: code,
      shared: true,
      revision: nextRevision,
      updatedAt: new Date().toISOString(),
    };

    const rows = await sql<{
      share_code: string;
      revision: number;
      payload: Trip;
      updated_at: string;
    }>(
      `update shared_trips
       set payload = $2::jsonb, revision = $3, trip_id = $4, updated_at = now()
       where share_code = $1
       returning share_code, revision, payload, updated_at`,
      [code, JSON.stringify(trip), nextRevision, trip.id],
    );

    const row = rows[0];
    return NextResponse.json(
      {
        shareCode: row.share_code,
        revision: row.revision,
        trip: row.payload,
        updatedAt: row.updated_at,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('PUT /api/shared-trips/[code]', error);
    return NextResponse.json({ error: '伺服器更新失敗' }, { status: 500 });
  }
}
