import { Link, useParams } from 'react-router-dom';
import { useSession } from '../hooks/useSessions';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { CheckIcon } from '../components/icons';
import { categoryColor } from '../lib/category';
import { formatVolume, relativeDayLabel, todayLocalDate } from '../lib/date';
import { ApiError } from '../api';

export function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { data: session, isLoading, isError, error, refetch } = useSession(sessionId);
  const today = todayLocalDate();

  if (isLoading) {
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <Spinner label="Loading session…" />
      </div>
    );
  }
  if (isError || !session) {
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Session not found.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 pb-10 pt-6 sm:px-9 sm:pt-8">
      <Link to="/history" className="text-sm font-medium text-ink-muted hover:text-ink">
        &larr; History
      </Link>

      <div
        className="mt-4 rounded-2xl px-6 py-6 text-white"
        style={{ backgroundColor: categoryColor(session.workout_category) }}
      >
        <div className="text-xs font-bold uppercase tracking-wide text-white/70">
          {relativeDayLabel(session.date, today)}
        </div>
        <div className="mt-1 text-2xl font-bold">{session.workout_title || 'Deleted workout'}</div>
        <div className="mt-1 text-sm text-white/85">
          {Math.round(session.duration_sec / 60)} min · {session.total_sets} sets ·{' '}
          {formatVolume(session.total_volume)}
          {session.distance_km ? ` · ${session.distance_km} km` : ''}
        </div>
      </div>

      {session.prs.length > 0 && (
        <div className="mt-5 rounded-xl bg-status-doneBg p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-status-done">PRs this session</div>
          {session.prs.map((pr) => (
            <div key={pr.exercise_id} className="mt-1.5 text-sm font-medium text-ink">
              {pr.exercise_name}: {pr.prior_best} lb → {pr.new_best} lb (+{pr.delta})
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {session.entries.map((entry, i) => (
          <div key={entry.exercise_id + i} className="rounded-2xl border border-black/[.07] bg-white p-4">
            <div className="text-[15px] font-bold text-ink">{entry.exercise_name ?? 'Removed exercise'}</div>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {entry.sets.map((s, j) => (
                <div key={j} className="flex items-center gap-2.5 text-sm">
                  <span className="w-5 flex-none text-xs font-semibold text-ink-faint">{j + 1}</span>
                  <span className={s.completed ? 'font-semibold text-ink' : 'text-ink-muted line-through'}>
                    {s.weight ?? '—'} lb × {s.reps ?? '—'}
                  </span>
                  {s.completed && <CheckIcon size={13} color="#567a3e" />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
