import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDeleteSession, useSession, useUpdateSession } from '../hooks/useSessions';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { CheckIcon, EditIcon, TrashIcon } from '../components/icons';
import { categoryColor } from '../lib/category';
import { formatVolume, relativeDayLabel, todayLocalDate } from '../lib/date';
import { ApiError } from '../api';
import type { SessionEntry } from '../types';

function cloneEntries(entries: SessionEntry[]): SessionEntry[] {
  return entries.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) }));
}

export function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { data: session, isLoading, isError, error, refetch } = useSession(sessionId);
  const updateSession = useUpdateSession();
  const deleteSession = useDeleteSession();
  const today = todayLocalDate();

  const [isEditing, setIsEditing] = useState(false);
  const [draftEntries, setDraftEntries] = useState<SessionEntry[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  function startEdit() {
    setDraftEntries(cloneEntries(session!.entries));
    updateSession.reset();
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    updateSession.reset();
  }

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
          sets: [...e.sets, { weight: last?.weight ?? null, reps: last?.reps ?? null, completed: last?.completed ?? false }],
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

  function saveEdit() {
    if (!sessionId) return;
    updateSession.mutate(
      { id: sessionId, body: { entries: draftEntries } },
      { onSuccess: () => setIsEditing(false) }
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 pb-10 pt-6 sm:px-9 sm:pt-8">
      <div className="flex items-center justify-between gap-3">
        <Link to="/history" className="text-sm font-medium text-ink-muted hover:text-ink">
          &larr; History
        </Link>
        {!isEditing && (
          <div className="flex flex-none items-center gap-2">
            <button
              type="button"
              onClick={startEdit}
              className="flex items-center gap-1.5 rounded-xl bg-panel2 px-4 py-2 text-sm font-semibold text-ink hover:bg-panel2/70"
            >
              <EditIcon size={14} />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 rounded-xl bg-status-missedBg px-4 py-2 text-sm font-semibold text-status-missed hover:bg-status-missedBg/70"
            >
              <TrashIcon size={14} />
              Delete
            </button>
          </div>
        )}
      </div>

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

      {!isEditing && (
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
      )}

      {isEditing && (
        <div className="mt-6 flex flex-col gap-5">
          <p className="text-sm text-ink-muted">
            Editing logged sets. Saving recalculates duration, total volume, and PRs.
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

          {updateSession.isError && (
            <p className="rounded-lg bg-status-missedBg px-4 py-2.5 text-sm text-status-missed">
              {updateSession.error instanceof ApiError
                ? updateSession.error.message
                : 'Could not save changes.'}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={updateSession.isPending}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-secondary hover:bg-panel2 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={updateSession.isPending}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {updateSession.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this logged workout?"
        message="This can't be undone."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!sessionId) return;
          deleteSession.mutate(sessionId, {
            onSuccess: () => navigate('/history'),
          });
        }}
      />
    </div>
  );
}
