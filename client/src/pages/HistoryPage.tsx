import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStats } from '../hooks/useStats';
import { useSessions } from '../hooks/useSessions';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { PlusIcon } from '../components/icons';
import { categoryColor } from '../lib/category';
import { formatVolume, relativeDayLabel, todayLocalDate } from '../lib/date';
import { ApiError } from '../api';
import type { WeeklyVolumePoint } from '../types';

// Loaded generously so the selected-week drill-down (decision #22) has enough
// history to filter client-side without extra pagination round-trips for the
// common case (last 8 weeks of a personal log).
const SESSIONS_PAGE_SIZE = 200; // server caps limit at 200; the 8-week chart window is well within this

function shortDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function HistoryPage() {
  const stats = useStats();
  const sessions = useSessions({ limit: SESSIONS_PAGE_SIZE });
  const today = todayLocalDate();

  const weeks = stats.data?.weekly_volume ?? [];
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);

  // Default selection = the latest week (last bar). Re-default whenever the
  // weekly_volume data first arrives or the current selection falls out of range.
  useEffect(() => {
    if (weeks.length === 0) return;
    const stillValid = weeks.some((w) => w.week_start === selectedWeekStart);
    if (!stillValid) {
      setSelectedWeekStart(weeks[weeks.length - 1].week_start);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks.map((w) => w.week_start).join(',')]);

  const selectedWeek: WeeklyVolumePoint | undefined = weeks.find(
    (w) => w.week_start === selectedWeekStart
  );

  const maxVolume = Math.max(1, ...(weeks.map((w) => w.volume) ?? [1]));

  const weekSessions = useMemo(() => {
    if (!selectedWeek || !sessions.data) return [];
    return sessions.data.sessions
      .filter((s) => {
        const d = s.date.slice(0, 10);
        return d >= selectedWeek.week_start && d <= selectedWeek.week_end;
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [selectedWeek, sessions.data]);

  return (
    <div className="px-5 pb-10 pt-6 sm:px-9 sm:pt-8">
      <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-faint">Progress</div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-[38px]">History</h1>
        <Link
          to="/history/new"
          className="flex flex-none items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
        >
          <PlusIcon size={16} />
          <span className="hidden sm:inline">Add workout</span>
        </Link>
      </div>

      {stats.isLoading && <Spinner label="Loading stats…" />}
      {stats.isError && (
        <ErrorState
          message={stats.error instanceof ApiError ? stats.error.message : 'Could not load stats.'}
          onRetry={() => stats.refetch()}
        />
      )}

      {stats.data && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <StatTile label="This month" value={stats.data.this_month_count} unit="workouts" />
            <StatTile label="Total volume" value={formatVolume(stats.data.total_volume)} raw />
            <StatTile label="Current streak" value={stats.data.current_streak} unit="days" accent />
            <StatTile label="PRs this month" value={stats.data.prs_this_month} />
          </div>

          <div className="mt-6 flex flex-col gap-6 lg:flex-row">
            <div className="flex-1 rounded-2xl border border-black/[.07] bg-white p-5">
              <div className="mb-5 flex items-baseline justify-between">
                <div className="text-[15px] font-bold text-ink">Weekly volume</div>
                <div className="text-xs text-ink-muted">weekly · lb</div>
              </div>
              <div className="flex h-[150px] items-end gap-2.5 sm:gap-3.5">
                {weeks.map((w, i) => {
                  const isSelected = w.week_start === selectedWeekStart;
                  const height = Math.max(4, (w.volume / maxVolume) * 100);
                  return (
                    <button
                      key={w.week_start}
                      type="button"
                      onClick={() => setSelectedWeekStart(w.week_start)}
                      aria-pressed={isSelected}
                      aria-label={`Week of ${shortDateLabel(w.week_start)}: ${formatVolume(w.volume)}`}
                      title={`${w.week_start} – ${w.week_end}: ${formatVolume(w.volume)}`}
                      className="flex h-full flex-1 flex-col items-center justify-end gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                    >
                      <div
                        className={`w-full rounded-t-md transition-colors ${
                          isSelected ? 'bg-accent' : 'bg-[#E3D7C4] hover:bg-[#d8c9ad]'
                        }`}
                        style={{ height: `${height}%` }}
                      />
                      <span className={`text-[11px] ${isSelected ? 'font-semibold text-ink' : 'text-ink-faint'}`}>
                        W{i + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:w-[330px] lg:flex-none">
              <div className="mb-3.5 flex items-baseline justify-between gap-2">
                <div className="text-[15px] font-bold text-ink">
                  {selectedWeek ? `Week of ${shortDateLabel(selectedWeek.week_start)}` : 'This week'}
                </div>
                {selectedWeek && (
                  <div className="text-xs text-ink-muted">
                    {shortDateLabel(selectedWeek.week_start)} – {shortDateLabel(selectedWeek.week_end)}
                  </div>
                )}
              </div>

              {sessions.isLoading && <Spinner label="Loading sessions…" />}
              {sessions.isError && (
                <ErrorState
                  message={sessions.error instanceof ApiError ? sessions.error.message : 'Could not load sessions.'}
                  onRetry={() => sessions.refetch()}
                />
              )}
              {sessions.data && selectedWeek && weekSessions.length === 0 && (
                <EmptyState
                  title="No workouts this week"
                  message={`${shortDateLabel(selectedWeek.week_start)} – ${shortDateLabel(selectedWeek.week_end)}`}
                />
              )}
              {sessions.data && weekSessions.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  {weekSessions.map((s) => (
                    <Link
                      key={s.id}
                      to={`/history/${s.id}`}
                      className="flex items-center gap-3 rounded-xl border border-black/[.07] bg-white p-3.5 hover:bg-panel/30"
                    >
                      <div
                        className="h-9 w-9 flex-none rounded-lg"
                        style={{ backgroundColor: categoryColor(s.workout_category) }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-ink">
                          {s.workout_title || 'Deleted workout'}
                        </div>
                        <div className="truncate text-xs text-ink-muted">
                          {relativeDayLabel(s.date, today)} ·{' '}
                          {s.distance_km
                            ? `${Math.round(s.duration_sec / 60)} min · ${s.distance_km} km`
                            : `${Math.round(s.duration_sec / 60)} min · ${s.total_sets} sets`}
                        </div>
                      </div>
                      {s.prs.length > 0 && (
                        <span className="flex-none rounded-lg bg-status-doneBg px-2.5 py-1 text-[11px] font-bold text-status-done">
                          +{s.prs[0].delta} lb PR
                        </span>
                      )}
                    </Link>
                  ))}
                  {sessions.data.total > sessions.data.sessions.length && (
                    <p className="mt-1 text-center text-[11px] text-ink-faint">
                      Showing the {sessions.data.sessions.length} most recent sessions.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  unit,
  accent,
  raw,
}: {
  label: string;
  value: number | string;
  unit?: string;
  accent?: boolean;
  raw?: boolean;
}) {
  const [num, sub] = raw && typeof value === 'string' ? value.split(' ') : [value, unit];
  return (
    <div className="rounded-card bg-panel p-4 sm:p-[18px]">
      <div className="text-[13px] font-semibold text-ink-faint">{label}</div>
      <div className={`mt-1 text-2xl font-bold sm:text-[28px] ${accent ? 'text-accent' : 'text-ink'}`}>
        {num} {sub && <span className="text-sm font-medium text-ink-muted">{sub}</span>}
      </div>
    </div>
  );
}
