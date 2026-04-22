export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.round(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.round(mon / 12)}y ago`;
}

export function formatHours(h: number): string {
  if (!h) return '0h';
  if (Number.isInteger(h)) return `${h}h`;
  return `${h.toFixed(1)}h`;
}

/** Format a decimal-hour total as a compact human-readable string using an
 *  8h work day. Sub-day totals fall through to formatHours (e.g. "6.5h"); at
 *  a full day or more we render "4d", "4d + 2h", etc.
 *
 *  We round the remainder to whole hours but carry into the next day if it
 *  would round to 8, so 15.7h → 2d (not 1d + 8h). */
export function formatHoursHuman(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '0h';
  const HOURS_PER_DAY = 8;
  if (h < HOURS_PER_DAY) return formatHours(Math.round(h * 10) / 10);
  let days = Math.floor(h / HOURS_PER_DAY);
  let rem = Math.round(h - days * HOURS_PER_DAY);
  if (rem >= HOURS_PER_DAY) {
    days += 1;
    rem -= HOURS_PER_DAY;
  }
  return rem === 0 ? `${days}d` : `${days}d + ${rem}h`;
}
