import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWorkouts } from '../hooks/useWorkouts';
import { useCreateSession } from '../hooks/useSessions';
import { ApiError, getExercise } from '../api';
import { buildActiveSessionFromWorkout } from '../lib/activeSession';
import { Spinner } from '../components/ui/Spinner';
import { CheckIcon, SearchIcon } from '../components/icons';
import { categoryColor } from '../lib/category';
import { localIsoForDate, todayLocalDate } from '../lib/date';
import type { SessionEntry, Workout } from '../types';

// Manual "forgot to track" log (decision #27). Reuses the exact set-prefill
// transform live tracking uses (`buildActiveSessionFromWorkout`) and the same
// set-row edit UI as SessionDetailPage's edit mode, but defaults every set to
// completed = true since the user is logging what they actually did.

function WorkoutSelect({ onSelect }: { onSelect: (workout: Workout) => void }) {
  const [query, setQuery] = useState('');
  const { data, isLoading } = useWorkouts({ q: query || undefined });

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-panel p-3.5">
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
      <div className="flex max-h-[280px] flex-col gap-1.5 overflow-y-auto">
        {isLoading && <Spinner label="Loading workouts…" />}
        {!isLoading && (data ?? []).length === 0 && (
          <p className="py-2 text-center text-sm text-ink-muted">No workouts found.</p>
        )}
        {(data ?? []).map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => onSelect(w)}
            className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2.5 text-left hover:bg-panel2"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 flex-none rounded-full"
                style={{ backgroundColor: categoryColor(w.category) }}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{w.title}</span>
                <span className="block text-xs text-ink-muted">
                  {w.category} · {w.exercise_count} exercise{w.exercise_count === 1 ? '' : 's'}
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AddSessionPage() {
  const navigate = useNavigate();
  const createSession = useCreateSession();

  const [date, setDate] = useState(todayLocalDate());
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [draftEntries, setDraftEntries] = useState<SessionEntry[]>([]);
  const [prefilling, setPrefilling] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);

  useEffect(() => {
    if (!workout) {
      setDraftEntries([]);
      return;
    }
    let cancelled = false;
    async function prefill(w: Workout) {
      setPrefilling(true);
      setPrefillError(null);
      try {
        const details = await Promise.all(
          w.exercises.map((e) => getExercise(e.exercise_id).catch(() => null))
        );
        const lastTimes: Record<string, { weight: number | null; reps: number | null } | null> = {};
        const names: Record<string, string> = {};
        details.forEach((d, i) => {
          const id = w.exercises[i].exercise_id;
          if (d) {
            names[id] = d.name;
            lastTimes[id] = d.last_time ? { weight: d.last_time.weight, reps: d.last_time.reps } : null;
          }
        });
        const built = buildActiveSessionFromWorkout(w, lastTimes, names);
        if (cancelled) return;
        setDraftEntries(
          built.entries.map((e) => ({
            exercise_id: e.exercise_id,
            exercise_name: e.exercise_name,
            // Default every prefilled set to completed — the user is logging what
            // they actually did, unlike live tracking which starts uncompleted.
            sets: e.sets.map((s) => ({ weight: s.weight, reps: s.reps, completed: true })),
          }))
        );
      } catch {
        if (!cancelled) setPrefillError("Could not load this workout's exercises. Try again.");
      } finally {
        if (!cancelled) setPrefilling(false);
      }
    }
    prefill(workout);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.id]);

  function updateDraftSet(
    entryIndex: number,
    setIndex: number,
    patch: Partial<{ weight: number | null; reps: number | null; completed: boolean }>
  ) {
    setDraftEntries((entries) =>
      entries.map((e, i) => {
        if (i !== entryIndex) return e;
        return { ...e, sets: e.sets.map((s, j) => (j === setIndex ? { ...s, ...patch } : s)) };
      })
    );
  }

  function addDraftSet(entryIndex: number) {
    setDraftEntries((entries) =>
      entries.map((e, i) => {
        if (i !== entryIndex) return e;
        const last = e.sets[e.sets.length - 1];
        return {
          ...e,
          sets: [
            ...e.sets,
            { weight: last?.weight ?? null, reps: last?.reps ?? null, completed: last?.completed ?? true },
          ],
        };
      })
    );
  }

  function removeDraftSet(entryIndex: number, setIndex: number) {
    setDraftEntries((entries) =>
      entries.map((e, i) => {
        if (i !== entryIndex) return e;
        return { ...e, sets: e.sets.filter((_, j) => j !== setIndex) };
      })
    );
  }

  const canSave = !!workout && draftEntries.length > 0 && !prefilling && !createSession.isPending;

  function save() {
    if (!workout || draftEntries.length === 0) return;
    createSession.mutate(
      {
        workout_id: workout.id,
        date: localIsoForDate(date),
        entries: draftEntries,
      },
      { onSuccess: () => navigate('/history') }
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 pb-10 pt-6 sm:px-9 sm:pt-8">
      <Link to="/history" className="text-sm font-medium text-ink-muted hover:text-ink">
        &larr; History
      </Link>

      <div className="mt-3 text-[11px] font-semibold uppercase tracking-[.14em] text-ink-faint">
        Log a past workout
      </div>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-[32px]">Add workout</h1>
      <p className="mt-2 text-sm text-ink-muted">
        For a workout you did but forgot to track live. Pick the date and the saved workout, then enter
        what you actually did.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        <label htmlFor="add-session-date" className="text-sm font-semibold text-ink">
          Date
        </label>
        <input
          id="add-session-date"
          type="date"
          value={date}
          max={todayLocalDate()}
          onChange={(e) => setDate(e.target.value)}
          className="w-full max-w-[220px] rounded-xl border border-black/[.08] bg-white px-3.5 py-2.5 text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <span className="text-sm font-semibold text-ink">Workout</span>
        {!workout && <WorkoutSelect onSelect={setWorkout} />}
        {workout && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-black/[.07] bg-white px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 flex-none rounded-full"
                style={{ backgroundColor: categoryColor(workout.category) }}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{workout.title}</div>
                <div className="text-xs text-ink-muted">{workout.category}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWorkout(null)}
              className="flex-none text-xs font-semibold text-ink-secondary hover:text-ink"
            >
              Change
            </button>
          </div>
        )}
      </div>

      {prefilling && (
        <div className="mt-6">
          <Spinner label="Loading exercises…" />
        </div>
      )}
      {prefillError && (
        <p className="mt-4 rounded-lg bg-status-missedBg px-4 py-2.5 text-sm text-status-missed" role="alert">
          {prefillError}
        </p>
      )}

      {!prefilling && draftEntries.length > 0 && (
        <div className="mt-6 flex flex-col gap-4">
          <p className="text-sm text-ink-muted">
            Prefilled from the workout's plan. Edit weight, reps, and sets to match what you actually did.
          </p>
          {draftEntries.map((entry, entryIndex) => (
            <div key={entry.exercise_id + entryIndex} className="rounded-2xl border border-black/[.07] bg-white p-4">
              <div className="text-[15px] font-bold text-ink">{entry.exercise_name ?? 'Removed exercise'}</div>
              <div className="mt-3 flex flex-col gap-2">
                {entry.sets.map((set, setIndex) => (
                  <div key={setIndex} className="flex items-center gap-2.5">
                    <span className="w-5 flex-none text-xs font-semibold text-ink-faint">{setIndex + 1}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={set.weight ?? ''}
                      onChange={(e) =>
                        updateDraftSet(entryIndex, setIndex, {
                          weight: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      placeholder="lb"
                      aria-label={`${entry.exercise_name ?? 'Exercise'} set ${setIndex + 1} weight`}
                      className="w-20 rounded-lg bg-panel px-2.5 py-2 text-center text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                    <span className="text-ink-faint">×</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={set.reps ?? ''}
                      onChange={(e) =>
                        updateDraftSet(entryIndex, setIndex, {
                          reps: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      placeholder="reps"
                      aria-label={`${entry.exercise_name ?? 'Exercise'} set ${setIndex + 1} reps`}
                      className="w-20 rounded-lg bg-panel px-2.5 py-2 text-center text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                    <button
                      type="button"
                      onClick={() => updateDraftSet(entryIndex, setIndex, { completed: !set.completed })}
                      aria-pressed={set.completed}
                      aria-label={`Mark set ${setIndex + 1} ${set.completed ? 'incomplete' : 'complete'}`}
                      className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${
                        set.completed ? 'bg-status-done' : 'border-2 border-black/10'
                      }`}
                    >
                      {set.completed && <CheckIcon size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeDraftSet(entryIndex, setIndex)}
                      aria-label={`Remove set ${setIndex + 1}`}
                      className="ml-auto text-xs font-semibold text-ink-faint hover:text-status-missed"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addDraftSet(entryIndex)}
                  className="mt-1 self-start text-xs font-semibold text-ink-secondary hover:text-ink"
                >
                  + Add set
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {createSession.isError && (
        <p className="mt-4 rounded-lg bg-status-missedBg px-4 py-2.5 text-sm text-status-missed" role="alert">
          {createSession.error instanceof ApiError ? createSession.error.message : 'Could not save this workout.'}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Link
          to="/history"
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-secondary hover:bg-panel2"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createSession.isPending ? 'Saving…' : 'Save workout'}
        </button>
      </div>
    </div>
  );
}
