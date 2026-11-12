import { NextResponse } from 'next/server';
import { clientIp, rateLimit } from '../../../src/lib/rateLimit';

export const runtime = 'nodejs';

type GeoResult = {
  results?: Array<{ name: string; latitude: number; longitude: number; country?: string }>;
};

type ForecastResult = {
  daily?: {
    time: string[];
    weathercode?: number[];
    weather_code?: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: number[];
  };
};

const CODE_LABEL: Record<number, string> = {
  0: '晴朗',
  1: '大致晴朗',
  2: '多雲',
  3: '陰天',
  45: '有霧',
  48: '霧凇',
  51: '細雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  71: '小雪',
  80: '陣雨',
  95: '雷雨',
};

function weatherLabel(code: number): string {
  return CODE_LABEL[code] || '天氣變化中';
}

function sampleDays(start: string, end: string, destination: string) {
  const days = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  let i = 0;
  while (cursor <= last && i < 7) {
    const date = cursor.toISOString().slice(0, 10);
    days.push({
      date,
      label: ['晴朗', '多雲', '陰天', '小雨'][i % 4],
      high: 22 + (i % 3),
      low: 16 + (i % 2),
      rainChance: 10 + i * 5,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    i += 1;
  }
  return {
    place: destination,
    source: 'sample',
    days,
    note: '目前顯示示意天氣',
  };
}

export async function GET(request: Request) {
  try {
    const ip = clientIp(request);
    if (!rateLimit(`weather:${ip}`, 20, 60_000)) {
      return NextResponse.json({ error: '天氣查詢過於頻繁，請稍後再試' }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const destination = (searchParams.get('destination') || '').trim().slice(0, 80);
    const start = (searchParams.get('start') || '').trim();
    const end = (searchParams.get('end') || '').trim();

    if (!destination || !start || !end) {
      return NextResponse.json({ error: '缺少目的地或日期' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return NextResponse.json({ error: '日期格式無效' }, { status: 400 });
    }

    const fallback = sampleDays(start, end, destination);

    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=zh&format=json`;
    const geoRes = await fetch(geoUrl, { next: { revalidate: 3600 } });
    if (!geoRes.ok) {
      return NextResponse.json(fallback, { headers: { 'cache-control': 'no-store' } });
    }
    const geo = (await geoRes.json()) as GeoResult;
    const hit = geo.results?.[0];
    if (!hit) {
      return NextResponse.json(fallback, { headers: { 'cache-control': 'no-store' } });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(`${start}T00:00:00`);
    const useArchive = startDate < today;

    const common =
      `latitude=${hit.latitude}&longitude=${hit.longitude}` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`;

    const forecastUrl = useArchive
      ? `https://archive-api.open-meteo.com/v1/archive?${common}`
      : `https://api.open-meteo.com/v1/forecast?${common}`;

    const forecastRes = await fetch(forecastUrl, { next: { revalidate: 1800 } });
    if (!forecastRes.ok) {
      return NextResponse.json(fallback, { headers: { 'cache-control': 'no-store' } });
    }
    const forecast = (await forecastRes.json()) as ForecastResult;
    const daily = forecast.daily;
    if (!daily?.time?.length) {
      return NextResponse.json(fallback, { headers: { 'cache-control': 'no-store' } });
    }

    const codes = daily.weathercode || daily.weather_code || [];
    const days = daily.time.map((date, index) => ({
      date,
      label: weatherLabel(codes[index] ?? 2),
      high: Math.round(daily.temperature_2m_max[index] ?? 0),
      low: Math.round(daily.temperature_2m_min[index] ?? 0),
      rainChance: Math.round(daily.precipitation_probability_max?.[index] ?? 0),
    }));

    return NextResponse.json(
      {
        place: `${hit.name}${hit.country ? ` · ${hit.country}` : ''}`,
        source: useArchive ? 'open-meteo-archive' : 'open-meteo',
        days,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('GET /api/weather', error);
    const { searchParams } = new URL(request.url);
    return NextResponse.json(
      sampleDays(
        searchParams.get('start') || new Date().toISOString().slice(0, 10),
        searchParams.get('end') || new Date().toISOString().slice(0, 10),
        searchParams.get('destination') || '目的地',
      ),
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  }
}
