// Wuthering Tools+ — calendar files (RFC 5545) for /today: "Waveplates full", "crystals full" and "<event> ends", so a
// phone's own calendar does the reminding (the site has no push notifications and no service worker). Times are
// UTC (`…Z`), so every calendar app shows them in its own zone. Pure.

export interface IcsEvent {
  /** stable per thing reminded of, so re-importing updates the entry instead of duplicating it */
  uid: string;
  start: number;
  /** default: start + 15 minutes */
  end?: number;
  title: string;
  description?: string;
  url?: string;
  /** a display alarm this many minutes before the start (0 = at the start); null = none */
  alarmMinutes?: number | null;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** 2026-10-26T13:34:00Z → "20261026T133400Z" */
export function icsDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** TEXT value escaping: backslash, semicolon, comma, newline */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** fold a content line at 75 octets (continuations start with a space), never inside a UTF-8 character */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = parts.length ? 74 : 75;
    if (bytes + b > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const safeUid = (s: string) => s.replace(/[^A-Za-z0-9._:-]+/g, "-");

/** minutes since 2026-01-01 UTC: a SEQUENCE that grows with every new file, so a re-import of the same UID is an update */
export function icsSequence(now: number): number {
  return Math.max(0, Math.floor((now - Date.UTC(2026, 0, 1)) / 60_000));
}

export function buildIcs(events: readonly IcsEvent[], now: number = Date.now()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wuthering Tools+//Today//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    if (!Number.isFinite(e.start)) continue;
    const end = e.end != null && e.end > e.start ? e.end : e.start + 15 * 60_000;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${safeUid(e.uid)}@wtplus`,
      `DTSTAMP:${icsDate(now)}`,
      `SEQUENCE:${icsSequence(now)}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.alarmMinutes != null && e.alarmMinutes >= 0)
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(e.title)}`, `TRIGGER:-PT${Math.round(e.alarmMinutes)}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
