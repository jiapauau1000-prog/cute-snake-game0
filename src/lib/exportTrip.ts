import type { Trip } from '../types';
import { CATEGORY_LABELS, ROLE_LABELS } from '../types';
import { formatDateRange, formatDayHeading } from './trips';
import { budgetRemaining, formatMoney, tripBudget } from './budget';

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toIcsDate(date: string, time?: string): string {
  const hhmm = (time || '09:00').replace(':', '');
  return `${date.replace(/-/g, '')}T${hhmm}00`;
}

export function buildIcs(trip: Trip): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//漫旅//Travel Planner//ZH',
    'CALSCALE:GREGORIAN',
  ];

  for (const day of trip.days) {
    for (const act of day.activities) {
      const start = toIcsDate(day.date, act.time || '09:00');
      const [h, m] = (act.time || '09:00').split(':').map(Number);
      const endMinutes = h * 60 + m + 60;
      const eh = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0');
      const em = String(endMinutes % 60).padStart(2, '0');
      const end = `${day.date.replace(/-/g, '')}T${eh}${em}00`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${act.id}@manlu.travel`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${icsEscape(act.title)}`,
        `LOCATION:${icsEscape(act.place || trip.destination)}`,
        `DESCRIPTION:${icsEscape(`${CATEGORY_LABELS[act.category]} ${act.notes || ''}`.trim())}`,
        'END:VEVENT',
      );
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(trip: Trip): void {
  const blob = new Blob([buildIcs(trip)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${trip.title || '漫旅行程'}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildPrintableHtml(trip: Trip): string {
  const currency = trip.currency || 'TWD';
  const title = escapeHtml(trip.title);
  const destination = escapeHtml(trip.destination);
  const notes = trip.notes ? `<p>${escapeHtml(trip.notes)}</p>` : '';

  const daysHtml = trip.days
    .map((day, index) => {
      const items = day.activities
        .map((a) => {
          const cost = a.cost ? ` · ${escapeHtml(formatMoney(a.cost, currency))}` : '';
          const place = escapeHtml(a.place || '未填地點');
          const actNotes = escapeHtml(a.notes || '');
          const actTitle = escapeHtml(a.title);
          const time = escapeHtml(a.time || '--:--');
          return `<li><strong>${time} ${actTitle}</strong> — ${place}${cost}<br/><span>${actNotes}</span></li>`;
        })
        .join('');
      return `<section><h2>${escapeHtml(formatDayHeading(day.date, index))}</h2><ol>${items || '<li>尚無活動</li>'}</ol></section>`;
    })
    .join('');

  const packing = (trip.packing || [])
    .map((p) => `<li>${p.done ? '☑' : '☐'} ${escapeHtml(p.label)}</li>`)
    .join('');
  const members = (trip.members || [])
    .map((m) => `<li>${escapeHtml(m.name)}（${escapeHtml(ROLE_LABELS[m.role])}）</li>`)
    .join('');

  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"/><title>${title}</title>
  <style>
    body{font-family:system-ui,sans-serif;padding:24px;color:#15202b;line-height:1.5}
    h1{margin:0 0 4px} h2{margin:24px 0 8px;font-size:18px}
    .meta{color:#5b6b78} ol,ul{padding-left:1.2rem}
    @media print{button{display:none}}
  </style></head><body>
  <h1>${title}</h1>
  <p class="meta">${destination} · ${escapeHtml(formatDateRange(trip.startDate, trip.endDate))} · 預算合計 ${escapeHtml(formatMoney(tripBudget(trip), currency))}${
    typeof trip.budgetCap === 'number' && trip.budgetCap > 0
      ? ` · 上限 ${escapeHtml(formatMoney(trip.budgetCap, currency))} · 剩餘 ${escapeHtml(formatMoney(budgetRemaining(trip) ?? 0, currency))}`
      : ''
  }</p>
  ${notes}
  ${daysHtml}
  ${packing ? `<section><h2>行李清單</h2><ul>${packing}</ul></section>` : ''}
  ${members ? `<section><h2>同伴分工</h2><ul>${members}</ul></section>` : ''}
  <script>window.onload=function(){window.print();}</script>
  </body></html>`;
}

export function printTrip(trip: Trip): void {
  const html = buildPrintableHtml(trip);
  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    return;
  }

  // WebView / popup blockers: fall back to a hidden iframe print.
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      window.setTimeout(() => frame.remove(), 1000);
    }
  }, 250);
}
