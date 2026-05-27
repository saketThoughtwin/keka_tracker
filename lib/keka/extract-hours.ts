import { parseDurationToMinutes, parseKekaTimestamp } from "./duration";

const COMPLETED_KEY =
  /(effective|inside|worked|complete|completed).*(hour|minute|time|duration)|totalEffectiveHours|effectiveHoursInHHMM/i;

const REMAINING_KEY =
  /remain|pending|due|left|shortfall|deficit|timeToComplete|balance/i;

const TARGET_KEY =
  /(shiftEffectiveDuration|shift.*effective.*duration|required|expected|target|policy|minimum|standard).*?(hour|minute|time|duration)/i;

function walk(
  node: unknown,
  matches: RegExp,
  out: number[],
  depth = 0,
): void {
  if (depth > 12 || node == null) return;

  if (Array.isArray(node)) {
    for (const item of node) walk(item, matches, out, depth + 1);
    return;
  }

  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (matches.test(key)) {
        const minutes = parseDurationToMinutes(value);
        if (minutes != null && minutes >= 0) out.push(minutes);
      }
      walk(value, matches, out, depth + 1);
    }
  }
}

function pickBest(candidates: number[], preferAround?: number): number | null {
  if (candidates.length === 0) return null;
  const unique = [...new Set(candidates)].sort((a, b) => a - b);
  if (preferAround != null) {
    return unique.reduce((best, n) =>
      Math.abs(n - preferAround) < Math.abs(best - preferAround) ? n : best,
    );
  }
  return unique[unique.length - 1];
}

export type ExtractedHours = {
  completedMinutes: number;
  remainingMinutes: number;
  targetMinutes: number;
  outsideMinutes: number;
  lastOutEpochMs: number | null;
  lastBreakDurationMinutes: number | null;
  currentlyOutside: boolean;
  timeToHomeMinutes: number | null;
  source:
    | "computed-from-timeEntries"
    | "summary-fields"
    | "computed-from-fallback";
};

export function extractHoursFromSummary(
  data: unknown,
  fallbackTargetMinutes: number,
  opts: { nowMs: number; timeZone: string; targetMinutesIsExplicit?: boolean },
): ExtractedHours {
  const { nowMs, timeZone, targetMinutesIsExplicit } = opts;

  if (!data || typeof data !== "object") {
    return {
      completedMinutes: 0,
      remainingMinutes: Math.max(0, fallbackTargetMinutes),
      targetMinutes: Math.max(0, fallbackTargetMinutes),
      outsideMinutes: 0,
      lastOutEpochMs: null,
      lastBreakDurationMinutes: null,
      currentlyOutside: false,
      timeToHomeMinutes: null,
      source: "computed-from-fallback",
    };
  }

  const row = data as Record<string, unknown>;

  const shiftEffectiveDuration =
    typeof row.shiftEffectiveDuration === "number"
      ? row.shiftEffectiveDuration
      : null;

  // If user explicitly configured a target (e.g., 8h effective), prefer that
  // over Keka's shiftEffectiveDuration (which is often 9h).
  const targetMinutes =
    targetMinutesIsExplicit
      ? Math.max(0, Math.round(fallbackTargetMinutes))
      : shiftEffectiveDuration != null
        ? Math.max(0, Math.round(shiftEffectiveDuration * 60))
        : Math.max(0, Math.round(fallbackTargetMinutes));

  const shiftEndTime =
    (typeof row.shiftEndTime === "string" ? row.shiftEndTime : null) ??
    (typeof row.shiftSlotEndTime === "string" ? row.shiftSlotEndTime : null);
  const shiftEndEpochMs =
    shiftEndTime != null ? parseKekaTimestamp(shiftEndTime, timeZone) : null;

  const timeToHomeMinutes =
    shiftEndEpochMs != null
      ? Math.max(0, Math.round((shiftEndEpochMs - nowMs) / 60_000))
      : null;

  // 1) Preferred: compute effective + outside using `timeEntries` (IN=0, OUT=1).
  const timeEntries = Array.isArray(row.timeEntries)
    ? (row.timeEntries as unknown[])
    : null;

  if (timeEntries && timeEntries.length > 0) {
    type Punch = { epochMs: number; status: 0 | 1 };

    const punches: Punch[] = timeEntries
      .map((e) => {
        if (!e || typeof e !== "object") return null;
        const entry = e as Record<string, unknown>;

        const ts =
          typeof entry.timestamp === "string"
            ? entry.timestamp
            : typeof entry.actualTimestamp === "string"
              ? entry.actualTimestamp
              : null;
        const epochMs = ts != null ? parseKekaTimestamp(ts, timeZone) : null;
        if (epochMs == null) return null;

        const statusRaw =
          typeof entry.punchStatus === "number"
            ? entry.punchStatus
            : typeof entry.modifiedPunchStatus === "number"
              ? entry.modifiedPunchStatus
              : typeof entry.originalPunchStatus === "number"
                ? entry.originalPunchStatus
                : null;
        if (statusRaw !== 0 && statusRaw !== 1) return null;

        return { epochMs, status: statusRaw as 0 | 1 };
      })
      .filter((p): p is Punch => p != null);

    punches.sort((a, b) => a.epochMs - b.epochMs);
    if (punches.length > 0) {
      let insideMs = 0;
      let outsideMs = 0;

      let currentInEpochMs: number | null = null;
      let breakStartEpochMs: number | null = null; // last OUT
      let lastOutEpochMs: number | null = null;

      let lastBreakDurationMinutes: number | null = null;
      let currentlyOutside = false;

      // When we see OUT after IN => close inside segment and start break segment.
      // When we see IN while on break => close break segment.
      for (const p of punches) {
        if (p.status === 0) {
          // IN
          if (currentInEpochMs == null) {
            currentInEpochMs = p.epochMs;
          } else {
            // Another IN without an OUT; treat as the new start.
            currentInEpochMs = p.epochMs;
          }

          if (breakStartEpochMs != null) {
            outsideMs += p.epochMs - breakStartEpochMs;
            lastOutEpochMs = breakStartEpochMs;
            lastBreakDurationMinutes = Math.max(
              0,
              Math.round((p.epochMs - breakStartEpochMs) / 60_000),
            );
            breakStartEpochMs = null;
            currentlyOutside = false;
          }
        } else {
          // OUT
          if (currentInEpochMs != null) {
            insideMs += p.epochMs - currentInEpochMs;
            currentInEpochMs = null;
          }

          breakStartEpochMs = p.epochMs;
          lastOutEpochMs = p.epochMs;
          currentlyOutside = true;
        }
      }

      if (currentInEpochMs != null) {
        insideMs += nowMs - currentInEpochMs;
      }

      if (breakStartEpochMs != null) {
        outsideMs += nowMs - breakStartEpochMs;
        lastBreakDurationMinutes = Math.max(
          0,
          Math.round((nowMs - breakStartEpochMs) / 60_000),
        );
        currentlyOutside = true;
      }

      const completedMinutes = Math.max(0, Math.round(insideMs / 60_000));
      const outsideMinutes = Math.max(0, Math.round(outsideMs / 60_000));
      const remainingMinutes = Math.max(0, targetMinutes - completedMinutes);

      return {
        completedMinutes,
        remainingMinutes,
        targetMinutes,
        outsideMinutes,
        lastOutEpochMs,
        lastBreakDurationMinutes,
        currentlyOutside,
        timeToHomeMinutes,
        source: "computed-from-timeEntries",
      };
    }
  }

  // 2) If timeEntries are missing, use summary fields (effective/shift duration).
  const totalEffectiveHours =
    typeof row.totalEffectiveHours === "number" ? row.totalEffectiveHours : null;
  if (totalEffectiveHours != null && shiftEffectiveDuration != null) {
    const completedMinutes = Math.max(
      0,
      Math.round(totalEffectiveHours * 60),
    );
    const remainingMinutes = Math.max(0, targetMinutes - completedMinutes);
    const outsideMinutes =
      typeof row.totalBreakDuration === "number"
        ? Math.max(0, Math.round((row.totalBreakDuration as number) * 60))
        : 0;
    const lastOutEpochMs =
      typeof row.lastOutOfTheDay === "string"
        ? parseKekaTimestamp(row.lastOutOfTheDay, timeZone)
        : null;
    const lastBreakDurationMinutes =
      typeof row.totalBreakDuration === "number"
        ? Math.max(0, Math.round((row.totalBreakDuration as number) * 60))
        : null;
    const currentlyOutside = typeof row.lastOutOfTheDay === "string" && row.lastOutOfTheDay != null;

    return {
      completedMinutes,
      remainingMinutes,
      targetMinutes,
      outsideMinutes,
      lastOutEpochMs,
      lastBreakDurationMinutes,
      currentlyOutside,
      timeToHomeMinutes,
      source: "summary-fields",
    };
  }

  // 3) Generic fallback: attempt to extract effective/inside fields heuristically.
  const completedCandidates: number[] = [];
  const remainingCandidates: number[] = [];
  const targetCandidates: number[] = [];

  walk(data, COMPLETED_KEY, completedCandidates);
  walk(data, REMAINING_KEY, remainingCandidates);
  walk(data, TARGET_KEY, targetCandidates);

  const completedMinutes = pickBest(completedCandidates, targetMinutes / 2) ?? 0;
  const remainingMinutes =
    pickBest(remainingCandidates, targetMinutes / 2) ??
    Math.max(0, targetMinutes - completedMinutes);

  return {
    completedMinutes: Math.max(0, completedMinutes),
    remainingMinutes: Math.max(0, remainingMinutes),
    targetMinutes: Math.max(0, targetMinutes),
    outsideMinutes: 0,
    lastOutEpochMs: null,
    lastBreakDurationMinutes: null,
    currentlyOutside: false,
    timeToHomeMinutes,
    source: "computed-from-fallback",
  };
}
