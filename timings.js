/* Prayer-time math for the scheduler. Same authority as the app
   (Aladhan, auto method per location) so server pushes and on-screen
   times always agree. One cached fetch per spot × day. */

const ALADHAN_BASE = "https://api.aladhan.com/v1";

const PRAYERS = [
  { key: "Fajr", label: "الفجر" },
  { key: "Dhuhr", label: "الظهر" },
  { key: "Asr", label: "العصر" },
  { key: "Maghrib", label: "المغرب" },
  { key: "Isha", label: "العشاء" },
];

export { PRAYERS };

function partsInZone(timeZone, date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/* YYYY-MM-DD of `date` as seen in the timezone (cache/rollover key). */
export function dayKeyInZone(timeZone, date = new Date()) {
  const parts = partsInZone(timeZone, date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/* DD-MM-YYYY path param for /timings/:date. */
function dmyInZone(timeZone, date = new Date()) {
  const parts = partsInZone(timeZone, date);
  return `${parts.day}-${parts.month}-${parts.year}`;
}

function tzOffsetMs(timeZone, utcMs) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(utcMs)
      .map((part) => [part.type, part.value]),
  );
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - utcMs;
}

/* "HH:MM" wall time on a YYYY-MM-DD day in the timezone → epoch ms. */
export function zonedAt(time, timeZone, ymd) {
  const [hours, minutes] = String(time).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const pad = (n) => String(n).padStart(2, "0");
  const guess = Date.parse(`${ymd}T${pad(hours)}:${pad(minutes)}:00Z`);
  if (!Number.isFinite(guess)) return null;
  return guess - tzOffsetMs(timeZone, guess);
}

export function spotKey(lat, lng) {
  return `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
}

export async function fetchTimings(lat, lng, timeZone, now = new Date()) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
  });
  const response = await fetch(
    `${ALADHAN_BASE}/timings/${dmyInZone(timeZone, now)}?${params}`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok) {
    throw new Error(`Aladhan timings error: ${response.status}`);
  }
  const body = await response.json();
  return body.data ?? body;
}

/* Half-hour marks from window start (inclusive) to end (exclusive). */
export function windowMarks(startStr, endStr, timeZone, ymd) {
  const start = startStr ? zonedAt(startStr, timeZone, ymd) : null;
  const end = endStr ? zonedAt(endStr, timeZone, ymd) : null;
  if (start == null || end == null || end <= start) return [];
  const marks = [];
  for (let at = start; at < end; at += 30 * 60 * 1000) marks.push(at);
  return marks;
}
