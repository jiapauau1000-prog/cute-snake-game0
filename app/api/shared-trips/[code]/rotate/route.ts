import { NextResponse } from 'next/server';
import type { Trip } from '../../../../../src/types';
import { sql } from '../../../../../src/lib/db';
import { clientIp, rateLimit } from '../../../../../src/lib/rateLimit';
import { secureEqual } from '../../../../../src/lib/secureCompare';
import {
  generateEditToken,
  generateShareCode,
  isPlausibleEditToken,
  isPlausibleShareCode,
  normalizeEditToken,
  normalizeShareCode,
} from '../../../../../src/lib/shareCode';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ code: string }> };

export async function POST(request: Request, context: Ctx) {
  try {
    const code = normalizeShareCode((await context.params).code);
    if (!isPlausibleShareCode(code)) {
      return NextResponse.json({ error: '分享碼無效' }, { status: 400 });
    }

    const ip = clientIp(request);
    if (!rateLimit(`shared-rotate-ip:${ip}`, 5, 60_000)) {
      return NextResponse.json({ error: '輪替過於頻繁，請稍後再試' }, { status: 429 });
    }

    const raw = await request.text();
    const body = raw ? (JSON.parse(raw) as { editToken?: unknown }) : {};
    const headerToken = normalizeEditToken(request.headers.get('x-manlu-edit-token') || '');
    const bodyToken = typeof body.editToken === 'string' ? normalizeEditToken(body.editToken) : '';
    const editToken = headerToken || bodyToken;
    if (!isPlausibleEditToken(editToken)) {
      return NextResponse.json({ error: '缺少有效的編輯權杖' }, { status: 401 });
    }

    const current = await sql<{
      edit_token: string;
      revision: number;
      payload: Trip;
      trip_id: string;
    }>('select edit_token, revision, payload, trip_id from shared_trips where share_code = $1', [
      code,
    ]);
    if (current.length === 0) {
      return NextResponse.json({ error: '找不到這個分享碼' }, { status: 404 });
    }
    if (!secureEqual(current[0].edit_token, editToken)) {
      return NextResponse.json({ error: '沒有權限輪替此共享旅程' }, { status: 403 });
    }

    let nextCode = '';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateShareCode(20);
      const existing = await sql<{ share_code: string }>(
        'select share_code from shared_trips where share_code = $1 limit 1',
        [candidate],
      );
      if (existing.length === 0) {
        nextCode = candidate;
        break;
      }
    }
    if (!nextCode) {
      return NextResponse.json({ error: '無法產生新分享碼' }, { status: 500 });
    }

    const nextEditToken = generateEditToken(32);
    const nextRevision = current[0].revision + 1;
    const payload: Trip = {
      ...current[0].payload,
      shareCode: nextCode,
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
       set share_code = $2,
           edit_token = $3,
           payload = $4::jsonb,
           revision = $5,
           updated_at = now()
       where share_code = $1 and edit_token = $6
       returning share_code, revision, payload, updated_at`,
      [code, nextCode, nextEditToken, JSON.stringify(payload), nextRevision, editToken],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: '沒有權限輪替此共享旅程' }, { status: 403 });
    }

    const row = rows[0];
    return NextResponse.json(
      {
        shareCode: row.share_code,
        editToken: nextEditToken,
        revision: row.revision,
        trip: { ...row.payload, editToken: nextEditToken },
        updatedAt: row.updated_at,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('POST /api/shared-trips/[code]/rotate', error);
    return NextResponse.json({ error: '伺服器輪替失敗' }, { status: 500 });
  }
}
