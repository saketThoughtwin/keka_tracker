"use client";

import { useCallback, useEffect, useState } from "react";
import type { AttendanceSnapshot } from "@/lib/keka/client";

const REFRESH_MS = 30_000;

type ApiResult =
  | { ok: true; data: AttendanceSnapshot }
  | { ok: false; error: string; hint?: string };

export function AttendanceTracker() {
  const [data, setData] = useState<AttendanceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance", { cache: "no-store" });
      const json = (await res.json()) as ApiResult;
      if (!json.ok) {
        setError(json.error);
        setHint(json.hint ?? null);
        setData(null);
        return;
      }
      setData(json.data);
      setError(null);
      setHint(null);
      setLastRefresh(new Date());
    } catch {
      setError("Could not reach /api/attendance");
      setHint("Is the dev server running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const timeStr = lastRefresh?.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 px-6 py-12">
      <header>
        {data?.date && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {data.date}
          </p>
        )}
      </header>

      {loading && !data && !error && (
        <p className="text-zinc-500">Loading from Keka…</p>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-medium">{error}</p>
          {hint && (
            <p className="mt-2 text-red-700/90 dark:text-red-300/90">{hint}</p>
          )}
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              label="Complete (inside)"
              value={data.completedLabel}
              sub=""
              accent="emerald"
            />
            <StatCard
              label="Time to home"
              value={
                data.timeToHomeLabel ? `${data.timeToHomeLabel} left` : "—"
              }
              sub=""
              accent="amber"
            />
          </div>

          <div className="flex justify-center">
            <div className="w-full max-w-xs rounded-xl border border-zinc-200 bg-white px-4 py-3 text-center dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Break / Outside
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">
                {data.lastOutLabel
                  ? data.currentlyOutside
                    ? `On break since ${data.lastOutLabel}`
                    : `Last OUT: ${data.lastOutLabel}`
                  : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {data.lastBreakDurationLabel
                  ? `Break: ${data.lastBreakDurationLabel}`
                  : "Break: —"}
                {" · "}
                Outside: {data.outsideLabel}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-2 flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
              <span>Progress</span>
              <span>{data.progressPercent}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${data.progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <footer className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>{timeStr ? `Updated ${timeStr}` : ""}</span>
      </footer>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: "emerald" | "amber";
}) {
  const ring =
    accent === "emerald"
      ? "border-emerald-200 dark:border-emerald-900"
      : "border-amber-200 dark:border-amber-900";
  const text =
    accent === "emerald"
      ? "text-emerald-700 dark:text-emerald-300"
      : "text-amber-700 dark:text-amber-300";

  return (
    <div className={`rounded-2xl border bg-white p-5 dark:bg-zinc-950 ${ring}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${text}`}>{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{sub}</p>
    </div>
  );
}
