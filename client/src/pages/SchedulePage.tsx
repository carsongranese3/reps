import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSchedule, useSetScheduleDay } from '../hooks/useSchedule';
import { useWorkouts } from '../hooks/useWorkouts';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { CheckIcon, ChevronIcon, PlusIcon, SearchIcon, XIcon } from '../components/icons';
import { categoryColor } from '../lib/category';
import {
  WEEKDAY_LABELS,
  WEEKDAYS,
  dayOfMonth,
  fullDateLabel,
  getMonthGrid,
  monthYearLabel,
  todayLocalDate,
  weekdayOfDate,
} from '../lib/date';
import { ApiError } from '../api';
import type { ScheduleDayBody, ScheduleEntry, Workout } from '../types';

const MAX_CELL_PILLS = 3;

function WorkoutPill({ workout, muted }: { workout: Workout; muted?: boolean }) {
  const color = categoryColor(workout.category);
  return muted ? (
    <span
      className="truncate rounded border border-dashed px-1 py-0.5 text-[9.5px] font-bold leading-tight"
      style={{ color, borderColor: color, opacity: 0.85 }}
    >
      {workout.title}
    </span>
  ) : (
    <span
      className="truncate rounded px-1 py-0.5 text-[9.5px] font-bold leading-tight text-white"
      style={{ backgroundColor: color }}
    >
      {workout.title}
    </span>
  );
}

function DayCell({
  date,
  inMonth,
  entry,
  isToday,
  todayStr,
  onSelect,
}: {
  date: string;
  inMonth: boolean;
  entry: ScheduleEntry | undefined;
  isToday: boolean;
  todayStr: string;
  onSelect: (date: string) => void;
}) {
  const workouts = entry?.workouts ?? [];
  const isSet = entry?.is_set ?? false;
  const source = entry?.source ?? 'template';
  const isPast = date < todayStr;
  const danglingOnly = source === 'schedule' && isSet && workouts.length === 0;

  const label =
    workouts.length === 0
      ? danglingOnly
        ? `${date}: Workout removed`
        : `${date}: Rest`
      : `${date}: ${workouts.map((w) => w.title).join(', ')}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(date)}
      aria-label={label}
      className={`relative flex min-h-[64px] flex-col gap-1 rounded-lg p-1.5 text-left transition-colors sm:min-h-[104px] sm:p-2 ${
        inMonth ? 'bg-white hover:bg-panel/50' : 'bg-panel/40 opacity-50 hover:opacity-70'
      } ${isToday ? 'ring-2 ring-ink' : 'border border-black/[.06]'}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-[11px] font-bold sm:text-xs ${
            !inMonth ? 'text-ink-faint' : isPast ? 'text-ink-faint' : 'text-ink'
          }`}
        >
          {dayOfMonth(date)}
        </span>
        <div className="flex items-center gap-1">
          {entry?.status === 'done' && (
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-status-done">
              <CheckIcon size={8} />
            </span>
          )}
          {entry?.status === 'missed' && (
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-status-missedRing bg-status-missedBg">
              <XIcon size={6} />
            </span>
          )}
          {isSet && <span className="h-1.5 w-1.5 flex-none rounded-full bg-accent" title="Set for this date" />}
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-0.5 overflow-hidden sm:justify-start">
        {danglingOnly ? (
          <span className="truncate rounded bg-panel2 px-1 py-0.5 text-[9.5px] font-semibold text-ink-faint">
            Workout removed
          </span>
        ) : workouts.length === 0 ? (
          <span className="hidden text-[10px] font-semibold text-status-restDot sm:block">Rest</span>
        ) : (
          <>
            {workouts.slice(0, MAX_CELL_PILLS).map((w, i) => (
              <WorkoutPill key={`${w.id}-${i}`} workout={w} muted={source === 'template'} />
            ))}
            {workouts.length > MAX_CELL_PILLS && (
              <span className="text-[9px] font-semibold text-ink-faint">
                +{workouts.length - MAX_CELL_PILLS} more
              </span>
            )}
          </>
        )}
      </div>
    </button>
  );
}

function WorkoutPicker({ onAdd }: { onAdd: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const { data, isLoading } = useWorkouts({ q: query || undefined });

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl bg-panel p-3.5">
      <label className="flex items-center gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-ink-faint">
        <SearchIcon size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search workouts"
          aria-label="Search workouts"
          className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </label>
      <div className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
        {isLoading && <Spinner label="Loading workouts…" />}
        {!isLoading && (data ?? []).length === 0 && (
          <p className="py-2 text-center text-sm text-ink-muted">No workouts found.</p>
        )}
        {(data ?? []).map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => onAdd(w.id)}
            className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-left hover:bg-panel2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 flex-none rounded-full"
                style={{ backgroundColor: categoryColor(w.category) }}
              />
              <span className="truncate text-sm font-medium text-ink">{w.title}</span>
            </span>
            <PlusIcon size={14} className="flex-none text-ink-faint" />
          </button>
        ))}
      </div>
    </div>
  );
}

function DayEditorSheet({
  date,
  entry,
  onClose,
}: {
  date: string;
  entry: ScheduleEntry | undefined;
  onClose: () => void;
}) {
  const setDay = useSetScheduleDay();
  const [pickerOpen, setPickerOpen] = useState(false);

  const weekdayLabel = WEEKDAY_LABELS[weekdayOfDate(date)];
  const isUnset = entry ? entry.source === 'template' : true;
  const isRest = entry?.source === 'rest';
  // The resolved list shown for this date (override OR inherited-from-template).
  // Editing from this base materializes an inherited day, so Add keeps the
  // inherited workout and Remove works on inherited days too.
  const baseIds = entry ? entry.workouts.map((w) => w.id) : [];

  function mutate(body: ScheduleDayBody) {
    setDay.mutate({ date, body });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-editor-title"
    >
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/10 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div id="day-editor-title" className="text-lg font-bold text-ink">
              {fullDateLabel(date)}
            </div>
            {entry && isUnset && (
              <div className="mt-0.5 text-xs font-medium text-ink-muted">
                Following your weekly plan ({weekdayLabel})
              </div>
            )}
            {entry && !isUnset && (
              <div className="mt-0.5 text-xs font-semibold text-accent">Set for this date</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-none rounded-full p-1.5 hover:bg-panel2"
          >
            <XIcon size={12} color="#6E6A62" />
          </button>
        </div>

        {!entry && <Spinner label="Loading…" />}

        {entry && (
          <>
            <div className="mt-4 flex flex-col gap-2">
              {entry.workouts.length === 0 ? (
                <div className="rounded-xl bg-panel px-4 py-3 text-sm font-semibold text-status-restDot">
                  {isRest ? 'Rest (set)' : 'Rest'}
                </div>
              ) : (
                entry.workouts.map((w, i) => (
                  <div
                    key={`${w.id}-${i}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-black/[.07] px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 flex-none rounded-full"
                        style={{ backgroundColor: categoryColor(w.category) }}
                      />
                      <div className="min-w-0">
                        <Link
                          to={`/workouts/${w.id}`}
                          className="truncate text-sm font-semibold text-ink hover:underline"
                        >
                          {w.title}
                        </Link>
                        <div className="text-xs text-ink-muted">
                          {w.category}
                          {isUnset ? ' · from weekly plan' : ''}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = baseIds.filter((_, idx) => idx !== i);
                        // Removing the last workout makes the date an explicit Rest day
                        // (an empty list would otherwise "clear" back to the weekly plan).
                        mutate(next.length === 0 ? { rest: true } : { workout_ids: next });
                      }}
                      className="flex-none text-xs font-semibold text-status-missed hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
              {entry.source === 'schedule' && entry.is_set && entry.workouts.length === 0 && (
                <p className="text-xs text-ink-muted">
                  A scheduled workout here was deleted from the library.
                </p>
              )}
            </div>

            {pickerOpen ? (
              <>
                <WorkoutPicker
                  onAdd={(id) => mutate({ workout_ids: [...baseIds, id] })}
                />
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="mt-2 self-end text-xs font-semibold text-ink-muted hover:text-ink"
                >
                  Done adding
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-[#D3CABA] p-3 text-sm font-semibold text-[#8A857C] hover:bg-panel/40"
              >
                <PlusIcon size={16} />
                Add workout
              </button>
            )}

            <div className="mt-4 flex gap-2.5 border-t border-black/[.06] pt-4">
              <button
                type="button"
                onClick={() => mutate({ clear: true })}
                disabled={isUnset}
                className="flex-1 rounded-lg bg-panel2 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-panel2/70 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reset to weekly plan
              </button>
            </div>

            {setDay.isError && (
              <p className="mt-2 text-xs font-semibold text-status-missed" role="alert">
                {setDay.error instanceof ApiError ? setDay.error.message : 'Could not save. Try again.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function SchedulePage() {
  const todayStr = todayLocalDate();
  const [todayY, todayM] = todayStr.split('-').map(Number);
  const [view, setView] = useState({ year: todayY, month: todayM - 1 });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const grid = useMemo(() => getMonthGrid(view.year, view.month), [view.year, view.month]);
  const from = grid[0].date;
  const to = grid[grid.length - 1].date;

  const { data, isLoading, isError, error, refetch } = useSchedule(from, to);
  const entryMap = useMemo(() => {
    const map: Record<string, ScheduleEntry> = {};
    for (const e of data?.schedule ?? []) map[e.date] = e;
    return map;
  }, [data]);

  function goToMonth(delta: number) {
    setSelectedDate(null);
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function goToday() {
    setSelectedDate(null);
    setView({ year: todayY, month: todayM - 1 });
  }

  return (
    <div className="px-5 pb-10 pt-6 sm:px-9 sm:pt-8">
      <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-faint">
        My Training
      </div>
      <div className="mt-1 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-[38px]">Schedule</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg bg-panel2 px-3.5 py-2 text-sm font-semibold text-ink hover:bg-panel2/70"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            aria-label="Previous month"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-panel2 hover:bg-panel2/70"
          >
            <ChevronIcon className="rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => goToMonth(1)}
            aria-label="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-panel2 hover:bg-panel2/70"
          >
            <ChevronIcon />
          </button>
        </div>
      </div>

      <div className="mt-2 text-lg font-bold text-ink-secondary sm:text-xl">
        {monthYearLabel(view.year, view.month)}
      </div>

      <div className="mt-4 hidden flex-wrap items-center gap-4 rounded-2xl bg-panel px-4 py-3 sm:flex">
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: categoryColor('Push') }} />
          Set for this date (override)
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed"
            style={{ borderColor: categoryColor('Push') }}
          />
          From weekly plan
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Has an override
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-status-done">
            <CheckIcon size={8} />
          </span>
          Done
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-status-missedRing bg-status-missedBg">
            <XIcon size={6} />
          </span>
          Missed
        </div>
      </div>

      {isLoading && <Spinner label="Loading your schedule…" />}
      {isError && (
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load the schedule.'}
          onRetry={() => refetch()}
        />
      )}

      {data && (
        <>
          <div className="mt-5 grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-ink-faint sm:gap-1.5">
            {WEEKDAYS.map((wd) => (
              <div key={wd} className="py-1">
                {WEEKDAY_LABELS[wd]}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-1.5">
            {grid.map((cell) => (
              <DayCell
                key={cell.date}
                date={cell.date}
                inMonth={cell.inMonth}
                entry={entryMap[cell.date]}
                isToday={cell.date === todayStr}
                todayStr={todayStr}
                onSelect={setSelectedDate}
              />
            ))}
          </div>
        </>
      )}

      {selectedDate && (
        <DayEditorSheet
          date={selectedDate}
          entry={entryMap[selectedDate]}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
