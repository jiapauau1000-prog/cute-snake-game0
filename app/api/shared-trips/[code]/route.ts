import { NextResponse } from 'next/server';
import type { Trip } from '../../../../src/types';
import { sql } from '../../../../src/lib/db';
import { normalizeShareCode } from '../../../../src/lib/shareCode';
import { assertTripPayloadSize, isValidTrip } from '../../../../src/lib/tripValidate';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

const recentLookups = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = recentLookups.get(key);
  if (!entry || entry.resetAt < now) {
    recentLookups.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

export async function GET(request: Request, context: Ctx) {
  try {
    const code = normalizeShareCode((await context.params).code);
    if (code.length < 4 || code.length > 16) {
      return NextResponse.json({ error: '分享碼無效' }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
    if (!rateLimit(`get:${ip}`, 60, 60_000)) {
      return NextResponse.json({ error: '請求過於頻繁，請稍後再試' }, { status: 429 });
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
    if (code.length < 4 || code.length > 16) {
      return NextResponse.json({ error: '分享碼無效' }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
    if (!rateLimit(`put:${ip}:${code}`, 40, 60_000)) {
      return NextResponse.json({ error: '更新過於頻繁，請稍後再試' }, { status: 429 });
    }

    const raw = await request.text();
    if (raw.length > 1_500_000) {
      return NextResponse.json({ error: '請求過大' }, { status: 413 });
    }

    const body = JSON.parse(raw) as { trip?: unknown; revision?: unknown };
    if (!isValidTrip(body.trip) || typeof body.revision !== 'number') {
      return NextResponse.json({ error: '更新資料不完整或圖片過大' }, { status: 400 });
    }

    const sizeError = assertTripPayloadSize(body.trip);
    if (sizeError) {
      return NextResponse.json({ error: sizeError }, { status: 413 });
    }

    const current = await sql<{ revision: number }>(
      'select revision from shared_trips where share_code = $1',
      [code],
    );
    if (current.length === 0) {
      return NextResponse.json({ error: '找不到這個分享碼' }, { status: 404 });
    }

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
