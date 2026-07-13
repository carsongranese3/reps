import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkouts, useUpdateWorkout } from '../hooks/useWorkouts';
import { useExerciseMap } from '../hooks/useExercises';
import { useGym } from '../hooks/useGyms';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { Chip } from '../components/ui/Chip';
import { GymIcon, HeartIcon, PlusIcon, SearchIcon } from '../components/icons';
import { categoryGradient, WORKOUT_CATEGORIES } from '../lib/category';
import { ResumeBanner } from '../components/ResumeBanner';
import { MuscleMap } from '../components/MuscleMap';
import { aggregateWorkoutIntensities, hasMappableMuscles } from '../lib/muscles';
import { ApiError } from '../api';
import type { Workout } from '../types';

const FILTERS = ['All', ...WORKOUT_CATEGORIES] as const;

function WorkoutCard({ workout }: { workout: Workout }) {
  const updateWorkout = useUpdateWorkout();
  const { map: exerciseMap } = useExerciseMap();
  const { data: gym } = useGym(workout.gym_id ?? undefined);
  const intensities = aggregateWorkoutIntensities(workout.exercises, exerciseMap);
  const showMap = hasMappableMuscles(intensities);

  return (
    <Link to={`/workouts/${workout.id}`} className="group flex flex-col gap-2.5">
      <div
        className="relative h-[140px] overflow-hidden rounded-card sm:h-[152px]"
        style={showMap ? { backgroundColor: '#F4EEE6' } : { background: categoryGradient(workout.category) }}
      >
        {showMap && (
          <MuscleMap view="front" intensities={intensities} className="h-full w-full py-2" />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            updateWorkout.mutate({ id: workout.id, body: { favorite: !workout.favorite } });
          }}
          aria-label={workout.favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={workout.favorite}
          className="absolute right-2.5 top-2.5 flex h-[31px] w-[31px] items-center justify-center rounded-full bg-white/80 backdrop-blur"
        >
          <HeartIcon filled={workout.favorite} />
        </button>
      </div>
      <div>
        <div className="text-[15.5px] font-semibold text-ink">{workout.title}</div>
        <div className="mt-0.5 text-[13px] text-ink-muted">
          {workout.category === 'Cardio'
            ? `${workout.est_minutes} min · Cardio`
            : `${workout.est_minutes} min · ${workout.exercise_count} exercise${
                workout.exercise_count === 1 ? '' : 's'
              } · ${workout.type}`}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[12.5px] text-ink-faint">
          <GymIcon size={12} /> {gym?.name ?? 'Generic'}
        </div>
      </div>
    </Link>
  );
}

export function WorkoutsPage() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const { data, isLoading, isError, error, refetch } = useWorkouts({
    q: q || undefined,
    category: filter === 'All' ? undefined : filter,
  });

  const count = data?.length ?? 0;

  return (
    <div className="px-5 pb-10 pt-6 sm:px-9 sm:pt-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-faint">
            My Training
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-[38px]">Workouts</h1>
            <span className="text-sm text-ink-muted sm:hidden">{count}</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <label className="relative flex w-full items-center gap-2.5 rounded-xl border border-black/5 bg-panel2 px-3.5 py-2.5 text-ink-faint sm:w-[290px]">
            <SearchIcon />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search workouts, exercises…"
              aria-label="Search workouts, exercises"
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </label>
          <Link
            to="/build"
            className="flex flex-none items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
          >
            <PlusIcon size={16} />
            <span className="hidden sm:inline">New workout</span>
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <ResumeBanner />
      </div>

      <div className="my-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip key={f} label={f} active={filter === f} onClick={() => setFilter(f)} />
        ))}
      </div>

      {isLoading && <Spinner label="Loading workouts…" />}
      {isError && (
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load workouts.'}
          onRetry={() => refetch()}
        />
      )}

      {data && data.length === 0 && q === '' && filter === 'All' && (
        <EmptyState
          title="No workouts yet"
          message="Design your first workout to see it here."
          action={
            <Link
              to="/build"
              className="mt-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
            >
              Build your first workout
            </Link>
          }
        />
      )}

      {data && data.length === 0 && (q !== '' || filter !== 'All') && (
        <EmptyState
          title="No workouts match"
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
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-[22px]">
          {data.map((w) => (
            <WorkoutCard key={w.id} workout={w} />
          ))}
        </div>
      )}
    </div>
  );
}
