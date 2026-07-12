import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDeleteWorkout, useUpdateWorkout, useWorkout } from '../hooks/useWorkouts';
import { useExerciseMap } from '../hooks/useExercises';
import { useGym } from '../hooks/useGyms';
import { useSchedule, useSetScheduleDay } from '../hooks/useSchedule';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ExerciseThumb } from '../components/ui/ExerciseThumb';
import { MuscleMap } from '../components/MuscleMap';
import { aggregateWorkoutIntensities, hasMappableMuscles } from '../lib/muscles';
import { EditIcon, GymIcon, HeartIcon, PlayIcon, TrashIcon, CalendarIcon } from '../components/icons';
import { categoryGradient } from '../lib/category';
import { WEEKDAYS, WEEKDAY_LABELS, weekDatesFor, todayLocalDate, dayOfMonth } from '../lib/date';
import { ApiError } from '../api';

export function WorkoutDetailPage() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const navigate = useNavigate();
  const { data: workout, isLoading, isError, error, refetch } = useWorkout(workoutId);
  const { map: exerciseMap } = useExerciseMap();
  const { data: gym } = useGym(workout?.gym_id ?? undefined);
  const updateWorkout = useUpdateWorkout();
  const deleteWorkout = useDeleteWorkout();
  const weekDates = weekDatesFor(todayLocalDate());
  const { data: weekSchedule } = useSchedule(weekDates.mon, weekDates.sun);
  const setScheduleDay = useSetScheduleDay();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const muscleIntensities = workout ? aggregateWorkoutIntensities(workout.exercises, exerciseMap) : {};
  const showMuscleMap = hasMappableMuscles(muscleIntensities);

  // Every muscle name worked across the workout's exercises, counted by how many
  // exercises hit it (drives ordering + emphasis), most-worked first.
  const workedMuscles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of workout?.exercises ?? []) {
      const ex = exerciseMap[entry.exercise_id];
      if (!ex) continue;
      for (const m of ex.muscles_worked ?? []) {
        const name = m.trim();
        if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    const max = Math.max(1, ...counts.values());
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count, emphasis: count / max }));
  }, [workout, exerciseMap]);

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
          {gym && (
            <span className="ml-1 inline-flex items-center gap-1">
              · <GymIcon size={13} className="text-white/85" /> {gym.name}
            </span>
          )}
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
        <div className="mt-4 rounded-xl bg-panel p-4">
          <div className="mb-2.5 text-xs font-semibold text-ink-muted">Add to this week</div>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const date = weekDates[day];
              const entry = weekSchedule?.schedule.find((e) => e.date === date);
              const isThis = !!entry?.workouts.some((w) => w.id === workout.id);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    const baseIds = entry ? entry.workouts.map((w) => w.id) : [];
                    const nextIds = isThis
                      ? baseIds.filter((id) => id !== workout.id)
                      : [...baseIds, workout.id];
                    // Emptying the day means Rest, not a revert-to-template clear.
                    setScheduleDay.mutate({
                      date,
                      body: nextIds.length === 0 ? { rest: true } : { workout_ids: nextIds },
                    });
                  }}
                  className={`flex flex-col items-center rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    isThis ? 'bg-ink text-white' : 'bg-white text-ink-secondary hover:bg-panel2'
                  }`}
                >
                  <span>{WEEKDAY_LABELS[day]}</span>
                  <span className={`text-[11px] ${isThis ? 'text-white/70' : 'text-ink-faint'}`}>
                    {dayOfMonth(date)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showMuscleMap && (
        <div className="mt-7 rounded-2xl bg-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink">Muscles worked</h2>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-faint">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: '#E7E0D4' }}
              />
              Light
              <span
                className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-accent"
              />
              Heavy
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-center">
            <MuscleMap view="both" intensities={muscleIntensities} className="h-[188px] w-full sm:w-1/2" />
            <ul className="flex flex-1 flex-wrap content-start gap-2 sm:flex-col sm:flex-nowrap sm:gap-1.5">
              {workedMuscles.map(({ name, count, emphasis }) => (
                <li
                  key={name}
                  className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm text-ink"
                >
                  <span
                    className="h-2 w-2 flex-none rounded-full bg-accent"
                    style={{ opacity: 0.35 + emphasis * 0.65 }}
                  />
                  <span className="font-medium">{name}</span>
                  {count > 1 && <span className="text-xs text-ink-faint">×{count}</span>}
                </li>
              ))}
            </ul>
          </div>
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
                {ex ? (
                  <ExerciseThumb exercise={ex} className="h-9 w-9 flex-none rounded-lg" iconSize={14} />
                ) : (
                  <div className="h-9 w-9 flex-none rounded-lg" style={{ backgroundColor: '#C4BBAD' }} />
                )}
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
