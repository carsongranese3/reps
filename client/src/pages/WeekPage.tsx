import { Link } from 'react-router-dom';
import { useWeek } from '../hooks/useWeek';
import { useExerciseMap } from '../hooks/useExercises';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { ResumeBanner } from '../components/ResumeBanner';
import { CheckIcon, PlayIcon, XIcon } from '../components/icons';
import { categoryColor, categoryTodayGradient } from '../lib/category';
import { dayOfMonth } from '../lib/date';
import type { DayStatus, WeekDay } from '../types';
import { ApiError } from '../api';

function DayDot({ status, isToday }: { status: DayStatus; isToday: boolean }) {
  if (isToday) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-white">
        <div className="h-2 w-2 rounded-full bg-ink" />
      </div>
    );
  }
  if (status === 'done') {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-status-done">
        <CheckIcon size={15} />
      </div>
    );
  }
  if (status === 'missed') {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-status-missedRing bg-status-missedBg">
        <XIcon />
      </div>
    );
  }
  if (status === 'planned') {
    return <div className="h-8 w-8 rounded-full border-[1.5px] border-dashed border-status-plannedRing bg-white" />;
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-status-rest">
      <div className="h-[2.5px] w-3 rounded bg-status-restDot" />
    </div>
  );
}

function WeekStrip({ n, m, streak, days }: { n: number; m: number; streak: number; days: WeekDay[] }) {
  return (
    <div className="rounded-2xl bg-panel px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        <div className="flex-none">
          <div className="text-xs font-semibold text-ink-faint">THIS WEEK</div>
          <div className="mt-0.5 text-xl font-bold text-ink sm:text-[22px]">
            {n} <span className="text-[15px] font-medium text-ink-muted">of {m} workouts</span>
          </div>
        </div>
        <div className="flex gap-2.5 sm:gap-3">
          {days.map((d) => (
            <div key={d.day} className="flex flex-col items-center gap-1.5 sm:gap-1.5">
              <span className="text-[9px] font-bold text-ink-faint sm:text-[10px]">
                {d.day.charAt(0).toUpperCase()}
              </span>
              <DayDot status={d.status} isToday={d.is_today} />
            </div>
          ))}
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs font-semibold text-ink-faint">STREAK</div>
          <div className="mt-0.5 text-xl font-bold text-accent sm:text-[22px]">
            {streak} <span className="text-[15px] font-medium text-ink-muted">days</span>
          </div>
        </div>
      </div>
      <div className="mt-3 hidden items-center gap-4 border-t border-black/[.06] pt-3 sm:flex sm:gap-[18px]">
        <LegendItem colorClass="bg-status-done" icon={<CheckIcon size={10} />} label="Done" />
        <LegendItem colorClass="bg-status-rest" icon={<div className="h-[2px] w-2 rounded bg-status-restDot" />} label="Rest" />
        <LegendItem
          colorClass="border-[1.5px] border-status-missedRing bg-status-missedBg"
          icon={<XIcon size={9} />}
          label="Missed"
        />
        <div className="flex items-center gap-1.5">
          <div className="h-[18px] w-[18px] flex-none rounded-full border-[1.5px] border-dashed border-status-plannedRing bg-white" />
          <span className="text-xs font-medium text-ink-secondary">Planned</span>
        </div>
        <span className="ml-auto text-xs italic text-ink-muted">
          Rest days don&rsquo;t count against your streak
        </span>
      </div>
      <p className="mt-2 text-xs italic text-ink-muted sm:hidden">
        Rest days don&rsquo;t count against your streak
      </p>
    </div>
  );
}

function LegendItem({
  colorClass,
  icon,
  label,
}: {
  colorClass: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full ${colorClass}`}>
        {icon}
      </div>
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
    </div>
  );
}

function DayRail({ days }: { days: WeekDay[] }) {
  return (
    <div className="my-5 grid grid-cols-7 gap-2 sm:gap-2.5">
      {days.map((d) => {
        const content = (
          <div
            className={`flex min-h-[92px] flex-col gap-2 rounded-xl p-2.5 sm:min-h-[104px] sm:p-3 ${
              d.is_today ? 'border-2 border-ink bg-white' : 'bg-panel'
            } ${d.workout ? 'cursor-pointer' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-[10px] font-bold tracking-wide sm:text-[11px] ${
                  d.is_today ? 'text-ink' : 'text-ink-faint'
                }`}
              >
                {d.day.slice(0, 3).toUpperCase()}
              </span>
              <span
                className={`text-xs font-bold sm:text-[13px] ${d.is_today ? 'text-ink' : 'text-[#8A857C]'}`}
              >
                {dayOfMonth(d.date)}
              </span>
            </div>
            {d.is_today && (
              <span className="relative -mt-1 self-center rounded-full bg-ink px-2 py-0.5 text-[9px] font-bold tracking-wide text-white">
                TODAY
              </span>
            )}
            {d.workout ? (
              <div
                className="mt-auto flex items-center gap-1 rounded-lg px-2 py-2 text-[10.5px] font-bold leading-tight text-white sm:text-[11.5px]"
                style={{
                  backgroundColor: categoryColor(d.workout.category),
                  opacity: d.status === 'done' ? 0.7 : 1,
                }}
              >
                {d.status === 'done' && <CheckIcon size={11} />}
                <span className="truncate">{d.workout.title}</span>
              </div>
            ) : (
              <div className="mt-auto py-2 text-center text-[10.5px] font-semibold text-status-restDot sm:text-[11.5px]">
                Rest
              </div>
            )}
          </div>
        );
        return d.workout ? (
          <Link key={d.day} to={`/workouts/${d.workout.id}`} aria-label={`${d.day}: ${d.workout.title}`}>
            {content}
          </Link>
        ) : (
          <div key={d.day} aria-label={`${d.day}: Rest day`}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

const WEEKDAY_FULL: Record<string, string> = {
  mon: 'MONDAY',
  tue: 'TUESDAY',
  wed: 'WEDNESDAY',
  thu: 'THURSDAY',
  fri: 'FRIDAY',
  sat: 'SATURDAY',
  sun: 'SUNDAY',
};

function TodayCard({ today }: { today: WeekDay }) {
  if (!today.workout) {
    return (
      <div className="rounded-2xl bg-panel px-6 py-8 text-center">
        <div className="text-xs font-bold tracking-wide text-ink-faint">
          TODAY · {WEEKDAY_FULL[today.day]}
        </div>
        <div className="mt-2 text-xl font-bold text-ink">Rest day — nothing planned</div>
        <p className="mt-1 text-sm text-ink-muted">Browse workouts or build one to schedule today.</p>
        <div className="mt-4 flex justify-center gap-3">
          <Link
            to="/workouts"
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
          >
            Browse workouts
          </Link>
          <Link
            to="/build"
            className="rounded-lg bg-panel2 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-panel2/70"
          >
            Build a workout
          </Link>
        </div>
      </div>
    );
  }

  const w = today.workout;
  return (
    <div
      className="relative overflow-hidden rounded-2xl px-6 py-6"
      style={{ background: categoryTodayGradient(w.category) }}
    >
      <span className="text-[11px] font-bold tracking-[.14em] text-white/70">
        TODAY · {WEEKDAY_FULL[today.day]}
      </span>
      <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="text-2xl font-bold text-white sm:text-[28px]">{w.title}</div>
          <div className="mt-1 text-sm text-white/85">
            {w.est_minutes} min · {w.exercise_count} exercise{w.exercise_count === 1 ? '' : 's'}
          </div>
        </div>
        <Link
          to={`/track/${w.id}`}
          className="flex flex-none items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-[15px] font-bold text-ink hover:bg-white/90"
        >
          <PlayIcon color="#1A1815" />
          Start workout
        </Link>
      </div>
    </div>
  );
}

export function WeekPage() {
  const { data, isLoading, isError, error, refetch } = useWeek();
  const { map: exerciseMap } = useExerciseMap();

  return (
    <div className="px-5 pb-10 pt-6 sm:px-9 sm:pt-8">
      <div className="eyebrow text-[11px] font-semibold uppercase tracking-[.14em] text-ink-faint">
        My Training
      </div>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-[38px]">This Week</h1>

      <div className="mt-5">
        <ResumeBanner />
      </div>

      {isLoading && <Spinner label="Loading your week…" />}
      {isError && (
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load This Week.'}
          onRetry={() => refetch()}
        />
      )}

      {data && (
        <>
          <WeekStrip n={data.n} m={data.m} streak={data.streak} days={data.days} />
          <DayRail days={data.days} />
          <TodayCard today={data.today} />

          <div className="mb-3.5 mt-6 flex items-baseline justify-between">
            <h2 className="text-base font-bold text-ink">Exercises</h2>
            {data.today.workout && (
              <span className="text-[13px] text-ink-muted">
                {data.today.workout.exercise_count} exercises · ~{data.today.workout.est_minutes} min
              </span>
            )}
          </div>

          {data.today.workout ? (
            <div className="flex flex-col gap-2.5 pb-4">
              {data.today.workout.exercises.map((entry, i) => {
                const ex = exerciseMap[entry.exercise_id];
                return (
                  <Link
                    key={`${entry.exercise_id}-${i}`}
                    to={ex ? `/exercises/${ex.id}` : '#'}
                    state={{
                      from: `/week`,
                      fromLabel: data.today.workout!.title,
                      prescription: { sets: entry.sets, reps: entry.reps, rest: entry.rest },
                    }}
                    className={`flex items-center gap-3.5 rounded-xl border border-black/[.07] bg-white px-4 py-3.5 ${
                      ex ? 'hover:bg-panel/40' : 'pointer-events-none opacity-60'
                    }`}
                  >
                    <div
                      className="relative h-9 w-9 flex-none rounded-lg"
                      style={{ backgroundColor: '#567a3e' }}
                    >
                      <PlayIcon className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-[14.5px] font-semibold text-ink">
                        {ex?.name ?? 'Removed exercise'}
                      </div>
                      <div className="truncate text-xs text-ink-muted">
                        {ex?.muscles_worked?.join(' · ') ?? '—'}
                      </div>
                    </div>
                    <span className="flex-none text-[13.5px] font-semibold text-ink-secondary">
                      {entry.sets} × {entry.reps}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="pb-4 text-sm text-ink-muted">Nothing scheduled for today.</p>
          )}
        </>
      )}
    </div>
  );
}
