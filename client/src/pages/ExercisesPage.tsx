import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useExercises } from '../hooks/useExercises';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { Chip } from '../components/ui/Chip';
import { PlayIcon, PlusIcon, SearchIcon } from '../components/icons';
import { categoryColor, WORKOUT_CATEGORIES } from '../lib/category';
import { ApiError } from '../api';

const FILTERS = ['All', ...WORKOUT_CATEGORIES] as const;

export function ExercisesPage() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const { data, isLoading, isError, error, refetch } = useExercises({
    q: q || undefined,
    category: filter === 'All' ? undefined : filter,
  });

  return (
    <div className="px-5 pb-10 pt-6 sm:px-9 sm:pt-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-faint">Library</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-[38px]">Exercises</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <label className="flex w-full items-center gap-2.5 rounded-xl border border-black/5 bg-panel2 px-3.5 py-2.5 text-ink-faint sm:w-[290px]">
            <SearchIcon />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search exercises…"
              aria-label="Search exercises"
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </label>
          <Link
            to="/exercises/new"
            className="flex flex-none items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
          >
            <PlusIcon size={16} />
            <span className="hidden sm:inline">New exercise</span>
          </Link>
        </div>
      </div>

      <div className="my-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip key={f} label={f} active={filter === f} onClick={() => setFilter(f)} />
        ))}
      </div>

      {isLoading && <Spinner label="Loading exercises…" />}
      {isError && (
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load exercises.'}
          onRetry={() => refetch()}
        />
      )}

      {data && data.length === 0 && q === '' && filter === 'All' && (
        <EmptyState
          title="Your exercise library is empty"
          message="Add your first movement so you can use it in a workout."
          action={
            <Link
              to="/exercises/new"
              className="mt-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
            >
              New exercise
            </Link>
          }
        />
      )}

      {data && data.length === 0 && (q !== '' || filter !== 'All') && (
        <EmptyState
          title="No exercises match"
          message="Try a different search term or filter."
          action={
            <button
              type="button"
              onClick={() => {
                setQ('');
                setFilter('All');
              }}
              className="mt-2 rounded-lg bg-panel2 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-panel2/70"
            >
              Clear filters
            </button>
          }
        />
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((ex) => (
            <Link
              key={ex.id}
              to={`/exercises/${ex.id}`}
              className="flex flex-col gap-2.5 rounded-card border border-black/[.06] bg-white p-3.5 hover:bg-panel/30"
            >
              <div
                className="relative flex h-20 items-center justify-center rounded-lg"
                style={{ backgroundColor: categoryColor(ex.category) }}
              >
                <PlayIcon size={18} />
              </div>
              <div>
                <div className="truncate text-sm font-semibold text-ink">{ex.name}</div>
                <div className="truncate text-xs text-ink-muted">{ex.muscles_worked.join(' · ') || '—'}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
