import { NextResponse } from 'next/server';
import type { Trip } from '../../../../src/types';
import { sql } from '../../../../src/lib/db';
import { matchesOwnerEditToken } from '../../../../src/lib/ownerAuth';
import { clientIp, rateLimit } from '../../../../src/lib/rateLimit';
import {
  isPlausibleEditToken,
  isPlausibleShareCode,
  normalizeEditToken,
  normalizeShareCode,
} from '../../../../src/lib/shareCode';
import {
  assertSharedTripImages,
  assertTripPayloadSize,
  isValidTrip,
} from '../../../../src/lib/tripValidate';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

function stripSecrets(trip: Trip): Trip {
  const { editToken: _editToken, ...rest } = trip;
  return rest;
}

export async function GET(request: Request, context: Ctx) {
  try {
    const code = normalizeShareCode((await context.params).code);
    if (!isPlausibleShareCode(code)) {
      return NextResponse.json({ error: '分享碼無效' }, { status: 400 });
    }

    const ip = clientIp(request);
    if (!(await rateLimit(`shared-get-ip:${ip}`, 30, 60_000))) {
      return NextResponse.json({ error: '請求過於頻繁，請稍後再試' }, { status: 429 });
    }
    if (!(await rateLimit(`shared-get-code:${code}`, 20, 60_000))) {
      return NextResponse.json({ error: '此分享碼查詢過於頻繁' }, { status: 429 });
    }

    // Share code grants read + collaborative sync only.
    // Owner edit_token is never returned here (not even with ?join=1).
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
    const trip: Trip = stripSecrets({
      ...row.payload,
      shareCode: row.share_code,
      shared: true,
      revision: row.revision,
    });

    return NextResponse.json(
      {
        shareCode: row.share_code,
        revision: row.revision,
        trip,
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
    if (!isPlausibleShareCode(code)) {
      return NextResponse.json({ error: '分享碼無效' }, { status: 400 });
    }

    const ip = clientIp(request);
    if (!(await rateLimit(`shared-put-ip:${ip}`, 30, 60_000))) {
      return NextResponse.json({ error: '更新過於頻繁，請稍後再試' }, { status: 429 });
    }
    if (!(await rateLimit(`shared-put-code:${code}`, 40, 60_000))) {
      return NextResponse.json({ error: '此行程更新過於頻繁' }, { status: 429 });
    }

    const raw = await request.text();
    if (raw.length > 450_000) {
      return NextResponse.json({ error: '請求過大' }, { status: 413 });
    }

    const body = JSON.parse(raw) as { trip?: unknown; revision?: unknown; editToken?: unknown };
    const headerToken = normalizeEditToken(request.headers.get('x-manlu-edit-token') || '');
    const bodyToken = typeof body.editToken === 'string' ? normalizeEditToken(body.editToken) : '';
    const offeredToken = headerToken || bodyToken;
    const hasOwnerToken = isPlausibleEditToken(offeredToken);

    if (!isValidTrip(body.trip) || typeof body.revision !== 'number') {
      return NextResponse.json({ error: '更新資料不完整或圖片過大' }, { status: 400 });
    }

    const imageError = assertSharedTripImages(body.trip);
    if (imageError) {
      return NextResponse.json({ error: imageError }, { status: 400 });
    }

    const sizeError = assertTripPayloadSize(body.trip);
    if (sizeError) {
      return NextResponse.json({ error: sizeError }, { status: 413 });
    }

    const current = await sql<{ revision: number; edit_token: string }>(
      'select revision, edit_token from shared_trips where share_code = $1',
      [code],
    );
    if (current.length === 0) {
      return NextResponse.json({ error: '找不到這個分享碼' }, { status: 404 });
    }

    const isOwner = matchesOwnerEditToken(code, current[0].edit_token, offeredToken);
    // Companions may update with the share code alone (omit token).
    // A non-matching / share-code-as-token offer is rejected.
    if (hasOwnerToken && !isOwner) {
      return NextResponse.json({ error: '沒有權限更新此共享旅程' }, { status: 403 });
    }

    // Only the exact current revision may advance (no skipping ahead).
    if (body.revision !== current[0].revision) {
      return NextResponse.json(
        { error: '行程已被其他人更新，請重新整理後再試', revision: current[0].revision },
        { status: 409 },
      );
    }

    const nextRevision = current[0].revision + 1;
    const trip: Trip = {
      ...stripSecrets(body.trip),
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

    if (rows.length === 0) {
      return NextResponse.json({ error: '找不到這個分享碼' }, { status: 404 });
    }

    const row = rows[0];
    return NextResponse.json(
      {
        shareCode: row.share_code,
        ...(isOwner ? { editToken: offeredToken } : {}),
        revision: row.revision,
        trip: stripSecrets(row.payload),
        updatedAt: row.updated_at,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('PUT /api/shared-trips/[code]', error);
    return NextResponse.json({ error: '伺服器更新失敗' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: Ctx) {
  try {
    const code = normalizeShareCode((await context.params).code);
    if (!isPlausibleShareCode(code)) {
      return NextResponse.json({ error: '分享碼無效' }, { status: 400 });
    }

    const ip = clientIp(request);
    if (!(await rateLimit(`shared-del-ip:${ip}`, 10, 60_000))) {
      return NextResponse.json({ error: '請求過於頻繁，請稍後再試' }, { status: 429 });
    }

    const raw = await request.text();
    const body = raw ? (JSON.parse(raw) as { editToken?: unknown }) : {};
    const headerToken = normalizeEditToken(request.headers.get('x-manlu-edit-token') || '');
    const bodyToken = typeof body.editToken === 'string' ? normalizeEditToken(body.editToken) : '';
    const editToken = headerToken || bodyToken;
    if (!isPlausibleEditToken(editToken)) {
      return NextResponse.json({ error: '缺少有效的編輯權杖' }, { status: 401 });
    }

    const current = await sql<{ edit_token: string }>(
      'select edit_token from shared_trips where share_code = $1',
      [code],
    );
    if (current.length === 0) {
      return NextResponse.json({ error: '找不到這個分享碼' }, { status: 404 });
    }
    if (!matchesOwnerEditToken(code, current[0].edit_token, editToken)) {
      return NextResponse.json({ error: '沒有權限刪除此共享旅程' }, { status: 403 });
    }

    await sql('delete from shared_trips where share_code = $1 and edit_token = $2', [
      code,
      editToken,
    ]);

    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('DELETE /api/shared-trips/[code]', error);
    return NextResponse.json({ error: '伺服器刪除失敗' }, { status: 500 });
  }
}

