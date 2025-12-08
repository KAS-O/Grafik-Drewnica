"use client";

import { Fragment } from "react";

export type DayAssignment = {
  id: string;
  name: string;
  position: string;
  shiftLabel: string;
  hasO: boolean;
  hasR: boolean;
  hasK: boolean;
  employmentRate?: string;
};

type DaySummaryModalProps = {
  dayLabel: string;
  dayNumber: number;
  assignments: DayAssignment[];
  onClose: () => void;
};

export function DaySummaryModal({ dayLabel, dayNumber, assignments, onClose }: DaySummaryModalProps) {
  const coordinators = assignments.filter((item) => item.hasK);
  const locationGroups = assignments.reduce(
    (acc, item) => {
      if (item.hasO) acc.o.push(item);
      else if (item.hasR) acc.r.push(item);
      else acc.none.push(item);
      return acc;
    },
    { o: [] as DayAssignment[], r: [] as DayAssignment[], none: [] as DayAssignment[] }
  );

  const groupedByPosition = assignments.reduce<Record<string, DayAssignment[]>>((acc, item) => {
    acc[item.position] = acc[item.position] || [];
    acc[item.position]?.push(item);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-sky-200/50 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-6 shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-sky-200">Podsumowanie dnia</p>
            <h2 className="text-2xl font-semibold text-sky-50">{dayLabel}</h2>
            <p className="text-sm text-sky-100/80">Kliknij poza oknem, aby zamknąć.</p>
          </div>
          <div className="flex flex-col items-end gap-2 text-xs text-sky-100/80">
            <span className="rounded-full border border-sky-200/40 bg-slate-800/80 px-3 py-1 font-semibold text-sky-50 shadow">
              Dzień {dayNumber}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-rose-300/50 bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-50 transition hover:bg-rose-500/30"
            >
              Zamknij
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-emerald-300/40 bg-emerald-900/30 p-4 text-emerald-50 shadow-inner">
            <h3 className="text-sm font-semibold uppercase tracking-wide">Strona O</h3>
            <p className="text-[11px] text-emerald-100/80">Osoby z dopiskiem O.</p>
            <div className="mt-3 space-y-2 text-sm">
              {locationGroups.o.length ? (
                locationGroups.o.map((item) => (
                  <div
                    key={`o-${item.id}`}
                    className="flex items-center justify-between rounded-xl bg-emerald-800/50 px-3 py-2 text-emerald-50"
                  >
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-[11px] uppercase tracking-wide text-emerald-100/80">{item.position}</p>
                    </div>
                    <span className="rounded-full bg-emerald-300/90 px-3 py-1 text-xs font-bold text-emerald-950 shadow">
                      {item.shiftLabel}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-emerald-100/70">Brak osób przypisanych.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-sky-300/40 bg-sky-900/30 p-4 text-sky-50 shadow-inner">
            <h3 className="text-sm font-semibold uppercase tracking-wide">Strona R</h3>
            <p className="text-[11px] text-sky-100/80">Osoby z dopiskiem R.</p>
            <div className="mt-3 space-y-2 text-sm">
              {locationGroups.r.length ? (
                locationGroups.r.map((item) => (
                  <div
                    key={`r-${item.id}`}
                    className="flex items-center justify-between rounded-xl bg-sky-800/50 px-3 py-2 text-sky-50"
                  >
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-[11px] uppercase tracking-wide text-sky-100/80">{item.position}</p>
                    </div>
                    <span className="rounded-full bg-sky-200/90 px-3 py-1 text-xs font-bold text-sky-900 shadow">
                      {item.shiftLabel}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-sky-100/70">Brak osób przypisanych.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-300/40 bg-amber-900/20 p-4 text-amber-50 shadow-inner">
            <h3 className="text-sm font-semibold uppercase tracking-wide">Koordynacja</h3>
            <p className="text-[11px] text-amber-100/80">Osoby z dopiskiem K.</p>
            <div className="mt-3 space-y-2 text-sm">
              {coordinators.length ? (
                coordinators.map((item) => (
                  <div
                    key={`k-${item.id}`}
                    className="flex items-center justify-between rounded-xl bg-amber-800/60 px-3 py-2 text-amber-50"
                  >
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-[11px] uppercase tracking-wide text-amber-100/80">{item.position}</p>
                    </div>
                    <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-bold text-amber-900 shadow">
                      {item.shiftLabel}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-amber-100/70">Brak osoby koordynującej.</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200/10 bg-slate-900/70 p-4 text-sm text-sky-50 shadow-inner">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide">Wszyscy zaplanowani</h3>
              <p className="text-[11px] text-sky-100/80">Pełna lista osób pracujących w tym dniu.</p>
            </div>
            <span className="rounded-full border border-sky-200/40 bg-slate-800/80 px-3 py-1 text-[11px] font-semibold text-sky-50">
              {assignments.length} os.
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(groupedByPosition).map(([position, items]) => (
              <div key={position} className="rounded-xl border border-slate-200/20 bg-slate-900/60 p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-sky-100">
                  <span>{position}</span>
                  <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] text-sky-50">{items.length} os.</span>
                </div>
                <div className="space-y-2 text-sm">
                  {items.map((item) => (
                    <Fragment key={item.id}>
                      <div className="flex items-center justify-between rounded-lg border border-slate-200/10 bg-slate-950/70 px-3 py-2">
                        <div>
                          <p className="font-semibold">{item.name}</p>
                          <p className="text-[11px] uppercase tracking-wide text-sky-100/70">
                            {item.shiftLabel}
                            {item.hasO && " · O"}
                            {item.hasR && " · R"}
                            {item.hasK && " · K"}
                          </p>
                        </div>
                        {item.employmentRate && (
                          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-sky-100/80">{item.employmentRate}</span>
                        )}
                      </div>
                    </Fragment>
                  ))}
                </div>
              </div>
            ))}
            {!assignments.length && (
              <p className="text-[11px] text-sky-100/70">Brak wpisów w tym dniu.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
