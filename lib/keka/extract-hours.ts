import { parseDurationToMinutes, parseKekaTimestamp } from "./duration";

const COMPLETED_KEY =
  /(effective|inside|worked|complete|completed).*(hour|minute|time|duration)|totalEffectiveHours|effectiveHoursInHHMM/i;

const REMAINING_KEY =
  /remain|pending|due|left|shortfall|deficit|timeToComplete|balance/i;

const TARGET_KEY =
  /(shiftEffectiveDuration|shift.*effective.*duration|required|expected|target|policy|minimum|standard).*?(hour|minute|time|duration)/i;

type Punch = { epochMs: number; status: 0 | 1 };

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

function parsePunches(
  timeEntries: unknown[],
  timeZone: string,
): Punch[] {
  return timeEntries
    .map((e) => {
      if (!e || typeof e !== "object") return null;
      const entry = e as Record<string, unknown>;
      if (entry.isDeleted === true) return null;

      const ts =
        typeof entry.timestamp === "string"
          ? entry.timestamp
          : typeof entry.actualTimestamp === "string"
            ? entry.actualTimestamp
            : null;
      const epochMs = ts != null ? parseKekaTimestamp(ts, timeZone) : null;
      if (epochMs == null) return null;

      // Use punchStatus only — Keka's effective inside/outside is based on this.
      const statusRaw =
        typeof entry.punchStatus === "number" ? entry.punchStatus : null;
      if (statusRaw !== 0 && statusRaw !== 1) return null;

      return { epochMs, status: statusRaw as 0 | 1 };
    })
    .filter((p): p is Punch => p != null)
    .sort((a, b) => a.epochMs - b.epochMs);
}

/** Sum closed IN→OUT pairs (Keka effective hours, excludes breaks). */
function sumValidInOutPairsMs(row: Record<string, unknown>): number {
  const pairs = row.validInOutPairs;
  if (!Array.isArray(pairs)) return 0;

  return pairs.reduce((acc, p) => {
    if (p && typeof p === "object" && typeof (p as { totalDuration?: unknown }).totalDuration === "number") {
      return acc + (p as { totalDuration: number }).totalDuration * 3_600_000;
    }
    return acc;
  }, 0);
}

/** Replay inside (IN→OUT) and outside (OUT→IN) segments from punches. */
function replayFromPunches(punches: Punch[], nowMs: number) {
  let insideMs = 0;
  let outsideMs = 0;
  let currentInEpochMs: number | null = null;
  let breakStartEpochMs: number | null = null;

  for (const p of punches) {
    if (p.status === 0) {
      if (breakStartEpochMs != null) {
        outsideMs += p.epochMs - breakStartEpochMs;
        breakStartEpochMs = null;
      }
      if (currentInEpochMs == null) {
        currentInEpochMs = p.epochMs;
      }
    } else {
      if (currentInEpochMs != null) {
        insideMs += p.epochMs - currentInEpochMs;
        currentInEpochMs = null;
      }
      breakStartEpochMs = p.epochMs;
    }
  }

  const last = punches.at(-1);
  if (last?.status === 0 && currentInEpochMs != null) {
    // Still inside — extend effective time only while last punch is IN.
    insideMs += nowMs - currentInEpochMs;
  } else if (last?.status === 1 && breakStartEpochMs != null) {
    // On break — extend outside only; effective (inside) must not grow.
    outsideMs += nowMs - breakStartEpochMs;
  }

  return { insideMs, outsideMs, last };
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
    | "computed-from-validInOutPairs"
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

  const targetMinutes = targetMinutesIsExplicit
    ? Math.max(0, Math.round(fallbackTargetMinutes))
    : shiftEffectiveDuration != null
      ? Math.max(0, Math.round(shiftEffectiveDuration * 60))
      : Math.max(0, Math.round(fallbackTargetMinutes));

  const timeEntries = Array.isArray(row.timeEntries)
    ? (row.timeEntries as unknown[])
    : null;

  const punches =
    timeEntries && timeEntries.length > 0
      ? parsePunches(timeEntries, timeZone)
      : [];

  const closedInsideMs = sumValidInOutPairsMs(row);
  const hasPairs = closedInsideMs > 0;

  if (punches.length > 0) {
    const last = punches.at(-1)!;
    const currentlyOutside = last.status === 1;

    let insideMs: number;
    let outsideMs: number;
    let source: ExtractedHours["source"];

    if (hasPairs) {
      // Effective hours = closed pairs only; add live segment only if still IN.
      insideMs = closedInsideMs;
      if (last.status === 0) {
        insideMs += nowMs - last.epochMs;
      }
      const replay = replayFromPunches(punches, nowMs);
      outsideMs = replay.outsideMs;
      source = "computed-from-validInOutPairs";
    } else {
      const replay = replayFromPunches(punches, nowMs);
      insideMs = replay.insideMs;
      outsideMs = replay.outsideMs;
      source = "computed-from-timeEntries";
    }

    const lastOutEpochMs =
      last.status === 1
        ? last.epochMs
        : punches.filter((p) => p.status === 1).at(-1)?.epochMs ?? null;

    const lastBreakDurationMinutes =
      currentlyOutside && lastOutEpochMs != null
        ? Math.max(0, Math.round((nowMs - lastOutEpochMs) / 60_000))
        : null;

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
      timeToHomeMinutes: null,
      source,
    };
  }

  const totalEffectiveHours =
    typeof row.totalEffectiveHours === "number" ? row.totalEffectiveHours : null;
  if (totalEffectiveHours != null) {
    const completedMinutes = Math.max(
      0,
      Math.round(totalEffectiveHours * 60),
    );
    const remainingMinutes = Math.max(0, targetMinutes - completedMinutes);
    const outsideMinutes =
      typeof row.totalBreakDuration === "number"
        ? Math.max(0, Math.round(row.totalBreakDuration * 60))
        : 0;
    const lastOutEpochMs =
      typeof row.lastOutOfTheDay === "string"
        ? parseKekaTimestamp(row.lastOutOfTheDay, timeZone)
        : null;
    const lastBreakDurationMinutes =
      typeof row.totalBreakDuration === "number"
        ? Math.max(0, Math.round(row.totalBreakDuration * 60))
        : null;
    const currentlyOutside =
      lastOutEpochMs != null &&
      (typeof row.lastInOfTheDay !== "string" || row.lastInOfTheDay == null);

    return {
      completedMinutes,
      remainingMinutes,
      targetMinutes,
      outsideMinutes,
      lastOutEpochMs,
      lastBreakDurationMinutes,
      currentlyOutside,
      timeToHomeMinutes: null,
      source: "summary-fields",
    };
  }

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
    timeToHomeMinutes: null,
    source: "computed-from-fallback",
  };
}
