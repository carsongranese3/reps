import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDeleteWorkout, useUpdateWorkout, useWorkout } from '../hooks/useWorkouts';
import { useExerciseMap } from '../hooks/useExercises';
import { usePlan, useSetPlanDay } from '../hooks/usePlan';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EditIcon, HeartIcon, PlayIcon, TrashIcon, CalendarIcon } from '../components/icons';
import { categoryGradient } from '../lib/category';
import { WEEKDAYS, WEEKDAY_LABELS } from '../lib/date';
import { ApiError } from '../api';

export function WorkoutDetailPage() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const navigate = useNavigate();
  const { data: workout, isLoading, isError, error, refetch } = useWorkout(workoutId);
  const { map: exerciseMap } = useExerciseMap();
  const updateWorkout = useUpdateWorkout();
  const deleteWorkout = useDeleteWorkout();
  const { data: plan } = usePlan();
  const setPlanDay = useSetPlanDay();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  if (isLoading) return <div className="px-5 pt-6 sm:px-9 sm:pt-8"><Spinner label="Loading workout…" /></div>;
  if (isError || !workout) {
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Workout not found.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="px-5 pb-10 pt-6 sm:px-9 sm:pt-8">
      <Link to="/workouts" className="text-sm font-medium text-ink-muted hover:text-ink">
        &larr; Workouts
      </Link>

      <div
        className="relative mt-4 overflow-hidden rounded-2xl px-6 py-7"
        style={{ background: categoryGradient(workout.category) }}
      >
        <button
          type="button"
          onClick={() => updateWorkout.mutate({ id: workout.id, body: { favorite: !workout.favorite } })}
          aria-pressed={workout.favorite}
          aria-label={workout.favorite ? 'Remove from favorites' : 'Add to favorites'}
          className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 backdrop-blur"
        >
          <HeartIcon filled={workout.favorite} />
        </button>
        <span className="text-[11px] font-bold tracking-[.1em] text-white/70">
          {workout.category.toUpperCase()} · {workout.type.toUpperCase()}
        </span>
        <div className="mt-1 text-[28px] font-bold text-white">{workout.title}</div>
        <div className="mt-1 text-sm text-white/85">
          {workout.est_minutes} min · {workout.exercise_count} exercise
          {workout.exercise_count === 1 ? '' : 's'}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        <Link
          to={`/track/${workout.id}`}
          className="flex items-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
          aria-disabled={workout.exercise_count === 0}
        >
          <PlayIcon color="#fff" />
          Start
        </Link>
        <Link
          to={`/build/${workout.id}`}
          className="flex items-center gap-2 rounded-xl bg-panel2 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-panel2/70"
        >
          <EditIcon />
          Edit
        </Link>
        <button
          type="button"
          onClick={() => setScheduleOpen((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-panel2 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-panel2/70"
        >
          <CalendarIcon />
          Schedule
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-2 rounded-xl bg-status-missedBg px-5 py-2.5 text-sm font-semibold text-status-missed hover:bg-status-missedBg/70"
        >
          <TrashIcon />
          Delete
        </button>
      </div>

      {scheduleOpen && (
        <div className="mt-4 flex flex-wrap gap-2 rounded-xl bg-panel p-4">
          {WEEKDAYS.map((day) => {
            const current = plan?.find((p) => p.day === day)?.workout?.id;
            const isThis = current === workout.id;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setPlanDay.mutate({ day, workoutId: isThis ? null : workout.id })}
                className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${
                  isThis ? 'bg-ink text-white' : 'bg-white text-ink-secondary hover:bg-panel2'
                }`}
              >
                {WEEKDAY_LABELS[day]}
              </button>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 mt-7 text-base font-bold text-ink">Exercises</h2>
      {workout.exercises.length === 0 ? (
        <p className="text-sm text-ink-muted">This workout has no exercises yet.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {workout.exercises.map((entry, i) => {
            const ex = exerciseMap[entry.exercise_id];
            return (
              <Link
                key={`${entry.exercise_id}-${i}`}
                to={ex ? `/exercises/${ex.id}` : '#'}
                state={{
                  from: `/workouts/${workout.id}`,
                  fromLabel: workout.title,
                  prescription: { sets: entry.sets, reps: entry.reps, rest: entry.rest },
                }}
                className={`flex items-center gap-3.5 rounded-xl border border-black/[.07] bg-white px-4 py-3.5 ${
                  ex ? 'hover:bg-panel/40' : 'opacity-60'
                }`}
              >
                <div
                  className="h-9 w-9 flex-none rounded-lg"
                  style={{ backgroundColor: ex ? '#567a3e' : '#C4BBAD' }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-semibold text-ink">
                    {ex?.name ?? 'Removed exercise'}
                  </div>
                  <div className="truncate text-xs text-ink-muted">
                    {ex?.muscles_worked?.join(' · ') ?? 'This exercise was deleted from the library'}
                  </div>
                </div>
                <span className="flex-none text-[13.5px] font-semibold text-ink-secondary">
                  {entry.sets} × {entry.reps} · {entry.rest}s
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this workout?"
        message="This can't be undone. Days scheduled with this workout become Rest, and past sessions keep their history."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteWorkout.mutate(workout.id, {
            onSuccess: () => navigate('/workouts'),
          });
        }}
      />
    </div>
  );
}
