/** Minimaler iCalendar-Export (RFC 5545) für Stundenplan und Fristen. */
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Zurich',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function escapeText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function localStamp(date, time) {
  return `${date.replace(/-/g, '')}T${(time || '00:00').slice(0, 5).replace(':', '')}00`;
}

function utcStamp(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function nextDay(date) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * events: { uid, summary, description, location, date, start, end } für Lektionen
 *      oder { uid, summary, description, dueAt } für Fristen.
 */
function buildCalendar(name, events, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HUB-042//Stundenplan//DE',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-WR-TIMEZONE:Europe/Zurich',
    ...VTIMEZONE,
  ];
  for (const ev of events) {
    lines.push('BEGIN:VEVENT', `UID:${ev.uid}`, `DTSTAMP:${utcStamp(now)}`);
    if (ev.dueAt) {
      lines.push(`DTSTART:${utcStamp(ev.dueAt)}`, `DTEND:${utcStamp(ev.dueAt)}`);
    } else if (ev.start && ev.end) {
      lines.push(
        `DTSTART;TZID=Europe/Zurich:${localStamp(ev.date, ev.start)}`,
        `DTEND;TZID=Europe/Zurich:${localStamp(ev.date, ev.end)}`
      );
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ev.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${nextDay(ev.date)}`);
    }
    lines.push(`SUMMARY:${escapeText(ev.summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

module.exports = { buildCalendar, escapeText };
