/** Parse Keka-style durations into total minutes. */
export function parseDurationToMinutes(value: unknown): number | null {
  if (value == null) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    // Heuristic: values under 48 are likely hours; larger values are minutes/seconds.
    if (value > 0 && value <= 24) return Math.round(value * 60);
    if (value > 24 && value <= 24 * 60) return Math.round(value);
    if (value > 24 * 60) return Math.round(value / 60);
    return Math.round(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // "03:45:00" or "3:45"
    const hms = trimmed.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    if (hms) {
      const h = Number(hms[1]);
      const m = Number(hms[2]);
      const s = hms[3] ? Number(hms[3]) : 0;
      return h * 60 + m + Math.floor(s / 60);
    }

    // "3h 45m" / "3 hours 45 minutes"
    const hm = trimmed.match(/(\d+)\s*h(?:ours?)?\s*(\d+)\s*m/i);
    if (hm) return Number(hm[1]) * 60 + Number(hm[2]);

    const hoursOnly = trimmed.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?)?$/i);
    if (hoursOnly) return Math.round(Number(hoursOnly[1]) * 60);

    const minutesOnly = trimmed.match(/^(\d+)\s*m(?:in(?:utes?)?)?$/i);
    if (minutesOnly) return Number(minutesOnly[1]);

    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) return parseDurationToMinutes(asNumber);
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("totalMinutes" in obj) return parseDurationToMinutes(obj.totalMinutes);
    if ("minutes" in obj) return parseDurationToMinutes(obj.minutes);
    if ("hours" in obj || "hour" in obj) {
      const h = Number(obj.hours ?? obj.hour ?? 0);
      const m = Number(obj.minutes ?? obj.minute ?? 0);
      return h * 60 + m;
    }
    if ("ticks" in obj && typeof obj.ticks === "number") {
      return Math.round(obj.ticks / 60_000_000);
    }
  }

  return null;
}

export function formatMinutes(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getZonedParts(epochMs: number, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = dtf.formatToParts(new Date(epochMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null;
  }

  return { year, month, day, hour, minute, second };
}

/**
 * Parse Keka timestamps into an epoch millis value.
 *
 * Keka returns values like `2026-05-27T10:19:40` (sometimes without `Z`).
 * We interpret them as being in `timeZone` so calculations match Keka UI.
 */
export function parseKekaTimestamp(
  value: unknown,
  timeZone: string,
): number | null {
  if (typeof value !== "string") return null;
  const ts = value.trim();
  if (!ts) return null;

  // If timezone is present (Z or +hh:mm / -hh:mm), trust JS parsing.
  if (/[zZ]$/.test(ts) || /[+-]\d{2}:?\d{2}$/.test(ts)) {
    const d = new Date(ts);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  // Expected: YYYY-MM-DDTHH:mm:ss (with optional seconds)
  const m = ts.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!m) {
    const d = new Date(ts);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] ? Number(m[6]) : 0;
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null;
  }

  // Guess epoch as if the components were UTC.
  const desiredUtcEpoch = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = desiredUtcEpoch;

  // Adjust guess so that when formatted in `timeZone`, it matches desired components.
  const desiredComponentsAsUtc = desiredUtcEpoch;
  for (let i = 0; i < 2; i++) {
    const parts = getZonedParts(guess, timeZone);
    if (!parts) break;
    const asLocalUtcEpoch = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const diff = desiredComponentsAsUtc - asLocalUtcEpoch;
    guess += diff;
  }

  return guess;
}

export function formatClock(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(epochMs));
}
