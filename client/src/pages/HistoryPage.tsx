import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStats } from '../hooks/useStats';
import { useSessions } from '../hooks/useSessions';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { categoryColor } from '../lib/category';
import { formatVolume, relativeDayLabel, todayLocalDate } from '../lib/date';
import { ApiError } from '../api';

const PAGE_SIZE = 12;

export function HistoryPage() {
  const stats = useStats();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sessions = useSessions({ limit });
  const today = todayLocalDate();

  const maxVolume = Math.max(1, ...(stats.data?.weekly_volume.map((w) => w.volume) ?? [1]));

  return (
    <div className="px-5 pb-10 pt-6 sm:px-9 sm:pt-8">
      <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-faint">Progress</div>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-[38px]">History</h1>

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
                <div className="text-xs text-ink-muted">last 8 weeks · lb</div>
              </div>
              <div className="flex h-[150px] items-end gap-2.5 sm:gap-3.5">
                {stats.data.weekly_volume.map((w, i) => {
                  const isLast = i === stats.data!.weekly_volume.length - 1;
                  const height = Math.max(4, (w.volume / maxVolume) * 100);
                  return (
                    <div key={w.week_start} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                      <div
                        className={`w-full rounded-t-md ${isLast ? 'bg-accent' : 'bg-[#E3D7C4]'}`}
                        style={{ height: `${height}%` }}
                        title={`${w.week_start} – ${w.week_end}: ${formatVolume(w.volume)}`}
                      />
                      <span className={`text-[11px] ${isLast ? 'font-semibold text-ink' : 'text-ink-faint'}`}>
                        W{i + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:w-[330px] lg:flex-none">
              <div className="mb-3.5 text-[15px] font-bold text-ink">Recent sessions</div>

              {sessions.isLoading && <Spinner label="Loading sessions…" />}
              {sessions.isError && (
                <ErrorState
                  message={sessions.error instanceof ApiError ? sessions.error.message : 'Could not load sessions.'}
                  onRetry={() => sessions.refetch()}
                />
              )}
              {sessions.data && sessions.data.sessions.length === 0 && (
                <EmptyState title="No sessions yet" message="Finish a workout to see it here." />
              )}
              {sessions.data && sessions.data.sessions.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  {sessions.data.sessions.map((s) => (
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
                    <button
                      type="button"
                      onClick={() => setLimit((n) => n + PAGE_SIZE)}
                      className="mt-1 rounded-lg bg-panel2 py-2.5 text-sm font-semibold text-ink hover:bg-panel2/70"
                    >
                      Load more
                    </button>
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
