import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useWorkout } from '../hooks/useWorkouts';
import { useCreateSession } from '../hooks/useSessions';
import { getExercise } from '../api';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { CheckIcon, PlayIcon } from '../components/icons';
import {
  ActiveSession,
  buildActiveSessionFromWorkout,
  clearActiveSession,
  loadActiveSession,
  saveActiveSession,
} from '../lib/activeSession';
import { categoryTodayGradient } from '../lib/category';
import { nowLocalIso, formatVolume } from '../lib/date';
import { ApiError } from '../api';
import type { Session } from '../types';

function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          onDone();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  return (
    <div className="flex items-center gap-3 rounded-lg bg-panel px-3.5 py-2 text-sm">
      <span className="font-semibold text-ink">Rest: {remaining}s</span>
      <button type="button" onClick={onDone} className="ml-auto text-xs font-semibold text-ink-muted hover:text-ink">
        Skip
      </button>
    </div>
  );
}

export function TrackPage() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const navigate = useNavigate();
  const { data: workout, isLoading, isError, error, refetch } = useWorkout(workoutId);
  const createSession = useCreateSession();

  const [session, setSession] = useState<ActiveSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [restTimer, setRestTimer] = useState<{ exerciseIndex: number; seconds: number } | null>(null);
  const [confirmFinishEmpty, setConfirmFinishEmpty] = useState(false);
  const [completed, setCompleted] = useState<Session | null>(null);

  useEffect(() => {
    const active = loadActiveSession();
    if (active && active.workout_id === workoutId) {
      setSession(active);
    }
  }, [workoutId]);

  useEffect(() => {
    if (session) saveActiveSession(session);
  }, [session]);

  const totalSets = useMemo(
    () => session?.entries.reduce((sum, e) => sum + e.sets.length, 0) ?? 0,
    [session]
  );
  const doneSets = useMemo(
    () => session?.entries.reduce((sum, e) => sum + e.sets.filter((s) => s.completed).length, 0) ?? 0,
    [session]
  );

  if (isLoading) {
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <Spinner label="Loading workout…" />
      </div>
    );
  }
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

  if (completed) {
    return (
      <div className="mx-auto max-w-lg px-5 pb-10 pt-10 text-center sm:px-9">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-status-done">
          <CheckIcon size={28} />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-ink">Workout complete</h1>
        <p className="mt-1 text-sm text-ink-muted">{workout.title}</p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-panel p-4">
            <div className="text-xl font-bold text-ink">{Math.round(completed.duration_sec / 60)}</div>
            <div className="text-xs text-ink-muted">minutes</div>
          </div>
          <div className="rounded-xl bg-panel p-4">
            <div className="text-xl font-bold text-ink">{completed.total_sets}</div>
            <div className="text-xs text-ink-muted">sets</div>
          </div>
          <div className="rounded-xl bg-panel p-4">
            <div className="text-xl font-bold text-ink">{formatVolume(completed.total_volume)}</div>
            <div className="text-xs text-ink-muted">volume</div>
          </div>
        </div>
        {completed.prs.length > 0 && (
          <div className="mt-5 rounded-xl bg-status-doneBg p-4 text-left">
            <div className="text-xs font-bold uppercase tracking-wide text-status-done">New PRs</div>
            {completed.prs.map((pr) => (
              <div key={pr.exercise_id} className="mt-1.5 text-sm font-medium text-ink">
                {pr.exercise_name}: +{pr.delta} lb ({pr.new_best} lb)
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => navigate('/week')}
          className="mt-8 w-full rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white hover:bg-ink/90"
        >
          Back to This Week
        </button>
      </div>
    );
  }

  if (!session) {
    if (workout.exercises.length === 0) {
      return (
        <div className="px-5 pt-6 sm:px-9 sm:pt-8">
          <ErrorState message="This workout has no exercises yet — add some in Build before starting it." />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-lg px-5 pb-10 pt-10 sm:px-9">
        <div
          className="rounded-2xl px-6 py-7 text-center"
          style={{ background: categoryTodayGradient(workout.category) }}
        >
          <div className="text-[11px] font-bold tracking-[.14em] text-white/70">READY</div>
          <div className="mt-2 text-2xl font-bold text-white">{workout.title}</div>
          <div className="mt-1 text-sm text-white/85">
            {workout.exercise_count} exercises · ~{workout.est_minutes} min
          </div>
        </div>
        {startError && (
          <p className="mt-4 rounded-lg bg-status-missedBg px-4 py-2.5 text-sm text-status-missed">{startError}</p>
        )}
        <button
          type="button"
          disabled={starting}
          onClick={async () => {
            setStarting(true);
            setStartError(null);
            try {
              const details = await Promise.all(
                workout.exercises.map((e) => getExercise(e.exercise_id).catch(() => null))
              );
              const lastTimes: Record<string, { weight: number | null; reps: number | null } | null> = {};
              const names: Record<string, string> = {};
              details.forEach((d, i) => {
                const id = workout.exercises[i].exercise_id;
                if (d) {
                  names[id] = d.name;
                  lastTimes[id] = d.last_time ? { weight: d.last_time.weight, reps: d.last_time.reps } : null;
                }
              });
              const built = buildActiveSessionFromWorkout(workout, lastTimes, names);
              saveActiveSession(built);
              setSession(built);
            } catch {
              setStartError('Could not start the workout. Try again.');
            } finally {
              setStarting(false);
            }
          }}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3.5 text-[15px] font-bold text-white hover:bg-ink/90 disabled:opacity-60"
        >
          <PlayIcon />
          {starting ? 'Preparing…' : 'Begin'}
        </button>
      </div>
    );
  }

  function updateSet(exerciseIndex: number, setIndex: number, patch: Partial<{ weight: number | null; reps: number | null; completed: boolean }>) {
    setSession((s) => {
      if (!s) return s;
      const entries = s.entries.map((e, i) => {
        if (i !== exerciseIndex) return e;
        const sets = e.sets.map((set, j) => (j === setIndex ? { ...set, ...patch } : set));
        return { ...e, sets };
      });
      return { ...s, entries };
    });
  }

  function addSet(exerciseIndex: number) {
    setSession((s) => {
      if (!s) return s;
      const entries = s.entries.map((e, i) => {
        if (i !== exerciseIndex) return e;
        const last = e.sets[e.sets.length - 1];
        return {
          ...e,
          sets: [...e.sets, { weight: last?.weight ?? null, reps: last?.reps ?? null, completed: false }],
        };
      });
      return { ...s, entries };
    });
  }

  function finish() {
    if (!session || !workout) return;
    const totalChecked = session.entries.reduce(
      (sum, e) => sum + e.sets.filter((s) => s.completed).length,
      0
    );
    if (totalChecked === 0 && !confirmFinishEmpty) {
      setConfirmFinishEmpty(true);
      return;
    }
    const startedAtMs = new Date(session.started_at).getTime();
    const durationSec = Math.max(0, Math.round((Date.now() - startedAtMs) / 1000));
    createSession.mutate(
      {
        workout_id: session.workout_id,
        date: nowLocalIso(),
        started_at: session.started_at,
        ended_at: new Date().toISOString(),
        duration_sec: durationSec,
        entries: session.entries.map((e) => ({
          exercise_id: e.exercise_id,
          exercise_name: e.exercise_name,
          sets: e.sets.map((s) => ({ weight: s.weight, reps: s.reps, completed: s.completed })),
        })),
      },
      {
        onSuccess: (created) => {
          clearActiveSession();
          setCompleted(created);
        },
      }
    );
  }

  return (
    <div className="px-5 pb-28 pt-6 sm:px-9 sm:pt-8 sm:pb-10">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-faint">Tracking</div>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-[32px]">{session.workout_title}</h1>
        </div>
        <button
          type="button"
          onClick={finish}
          disabled={createSession.isPending}
          className="flex-none rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {createSession.isPending ? 'Finishing…' : 'Finish workout'}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel2">
          <div
            className="h-full rounded-full bg-status-done transition-all"
            style={{ width: totalSets ? `${(doneSets / totalSets) * 100}%` : '0%' }}
          />
        </div>
        <span className="flex-none text-sm font-semibold text-ink-secondary">
          {doneSets} of {totalSets} sets done
        </span>
      </div>

      {createSession.isError && (
        <p className="mt-3 rounded-lg bg-status-missedBg px-4 py-2.5 text-sm text-status-missed">
          {createSession.error instanceof ApiError ? createSession.error.message : 'Could not finish the workout.'}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {session.entries.map((entry, exIndex) => (
          <div key={entry.exercise_id + exIndex} className="rounded-2xl border border-black/[.07] bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <Link
                  to={`/exercises/${entry.exercise_id}`}
                  state={{
                    from: `/track/${workout.id}`,
                    fromLabel: workout.title,
                    prescription: { sets: entry.target_sets, reps: entry.target_reps, rest: entry.target_rest },
                  }}
                  className="text-[15px] font-bold text-ink hover:underline"
                >
                  {entry.exercise_name}
                </Link>
                <div className="text-xs text-ink-muted">
                  {entry.target_sets} × {entry.target_reps} · {entry.target_rest}s rest
                </div>
              </div>
              {entry.last_time && (
                <span className="text-xs font-medium text-ink-muted">
                  Last time: {entry.last_time.weight ?? '—'} lb × {entry.last_time.reps ?? '—'}
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {entry.sets.map((set, setIndex) => (
                <div key={setIndex} className="flex items-center gap-2.5">
                  <span className="w-5 flex-none text-xs font-semibold text-ink-faint">{setIndex + 1}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={set.weight ?? ''}
                    onChange={(e) =>
                      updateSet(exIndex, setIndex, { weight: e.target.value === '' ? null : Number(e.target.value) })
                    }
                    placeholder="lb"
                    aria-label={`${entry.exercise_name} set ${setIndex + 1} weight`}
                    className="w-20 rounded-lg bg-panel px-2.5 py-2 text-center text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <span className="text-ink-faint">×</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={set.reps ?? ''}
                    onChange={(e) =>
                      updateSet(exIndex, setIndex, { reps: e.target.value === '' ? null : Number(e.target.value) })
                    }
                    placeholder="reps"
                    aria-label={`${entry.exercise_name} set ${setIndex + 1} reps`}
                    className="w-20 rounded-lg bg-panel px-2.5 py-2 text-center text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const nowCompleted = !set.completed;
                      updateSet(exIndex, setIndex, { completed: nowCompleted });
                      if (nowCompleted && entry.target_rest > 0) {
                        setRestTimer({ exerciseIndex: exIndex, seconds: entry.target_rest });
                      }
                    }}
                    aria-pressed={set.completed}
                    aria-label={`Mark set ${setIndex + 1} ${set.completed ? 'incomplete' : 'complete'}`}
                    className={`ml-auto flex h-8 w-8 flex-none items-center justify-center rounded-full ${
                      set.completed ? 'bg-status-done' : 'border-2 border-black/10'
                    }`}
                  >
                    {set.completed && <CheckIcon size={14} />}
                  </button>
                </div>
              ))}
              {restTimer && restTimer.exerciseIndex === exIndex && (
                <RestTimer seconds={restTimer.seconds} onDone={() => setRestTimer(null)} />
              )}
              <button
                type="button"
                onClick={() => addSet(exIndex)}
                className="mt-1 self-start text-xs font-semibold text-ink-secondary hover:text-ink"
              >
                + Add set
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmFinishEmpty}
        title="Nothing logged"
        message="Finish anyway? The session will complete with 0 sets recorded."
        confirmLabel="Finish anyway"
        onCancel={() => setConfirmFinishEmpty(false)}
        onConfirm={() => {
          setConfirmFinishEmpty(false);
          finish();
        }}
      />
    </div>
  );
}
