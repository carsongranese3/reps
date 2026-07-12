import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCreateWorkout, useUpdateWorkout, useWorkout } from '../hooks/useWorkouts';
import { useCreateExercise, useExercises } from '../hooks/useExercises';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Chip } from '../components/ui/Chip';
import { DragIcon, PlusIcon, SearchIcon } from '../components/icons';
import { categoryColor, WORKOUT_CATEGORIES, WORKOUT_TYPES } from '../lib/category';
import { estimateMinutes } from '../lib/estimate';
import { ApiError } from '../api';
import type { Exercise, WorkoutCategory, WorkoutExerciseEntry, WorkoutType } from '../types';

interface Row extends WorkoutExerciseEntry {
  _key: string;
}

let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `row-${keyCounter}-${Date.now()}`;
}

function QuickCreateExercise({
  onCreated,
  onClose,
}: {
  onCreated: (ex: Exercise) => void;
  onClose: () => void;
}) {
  const createExercise = useCreateExercise();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<WorkoutCategory>('Strength');
  const [muscles, setMuscles] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-win">
        <h2 className="text-lg font-bold text-ink">New exercise</h2>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink-secondary">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="e.g. Cable Crossover"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink-secondary">
            Muscles worked (comma separated)
            <input
              value={muscles}
              onChange={(e) => setMuscles(e.target.value)}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="Chest, Triceps"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {WORKOUT_CATEGORIES.map((c) => (
              <Chip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />
            ))}
          </div>
          {error && <p className="text-sm text-status-missed">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-ink-secondary hover:bg-panel2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={createExercise.isPending}
            onClick={() => {
              if (!name.trim()) {
                setError('Name your exercise.');
                return;
              }
              createExercise.mutate(
                {
                  name: name.trim(),
                  category,
                  muscles_worked: muscles
                    .split(',')
                    .map((m) => m.trim())
                    .filter(Boolean),
                },
                {
                  onSuccess: (ex) => onCreated(ex),
                  onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not create exercise.'),
                }
              );
            }}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60"
          >
            {createExercise.isPending ? 'Creating…' : 'Create & add'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BuildPage() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const isEdit = !!workoutId;
  const navigate = useNavigate();
  const { data: existing, isLoading, isError, error, refetch } = useWorkout(workoutId);
  const { data: library } = useExercises();
  const createWorkout = useCreateWorkout();
  const updateWorkout = useUpdateWorkout();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<WorkoutType>('Strength');
  const [category, setCategory] = useState<WorkoutCategory>('Strength');
  const [rows, setRows] = useState<Row[]>([]);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(!isEdit);

  useEffect(() => {
    if (isEdit && existing && !hydrated) {
      setTitle(existing.title);
      setType(existing.type);
      setCategory(existing.category);
      setRows(existing.exercises.map((e) => ({ ...e, _key: nextKey() })));
      setHydrated(true);
    }
  }, [isEdit, existing, hydrated]);

  const exerciseMap = useMemo(() => {
    const m: Record<string, Exercise> = {};
    library?.forEach((e) => (m[e.id] = e));
    return m;
  }, [library]);

  const isDirty = useMemo(() => {
    if (!isEdit) return title.trim() !== '' || rows.length > 0;
    if (!existing) return false;
    if (title !== existing.title || type !== existing.type || category !== existing.category) return true;
    if (rows.length !== existing.exercises.length) return true;
    return rows.some((r, i) => {
      const o = existing.exercises[i];
      return !o || r.exercise_id !== o.exercise_id || r.sets !== o.sets || r.reps !== o.reps || r.rest !== o.rest;
    });
  }, [isEdit, existing, title, type, category, rows]);

  const liveEstimate = estimateMinutes(rows);

  const filteredLibrary = (library ?? []).filter((e) =>
    e.name.toLowerCase().includes(libraryQuery.toLowerCase())
  );

  function addExercise(ex: Exercise) {
    setRows((r) => [...r, { _key: nextKey(), exercise_id: ex.id, sets: 3, reps: '8-10', rest: 60 }]);
    setLibraryOpen(false);
  }

  function updateRow(key: string, patch: Partial<WorkoutExerciseEntry>) {
    setRows((r) => r.map((row) => (row._key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    setRows((r) => r.filter((row) => row._key !== key));
  }

  function moveRow(index: number, dir: -1 | 1) {
    setRows((r) => {
      const next = [...r];
      const target = index + dir;
      if (target < 0 || target >= next.length) return r;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleSave() {
    setValidationError(null);
    if (!title.trim()) {
      setValidationError('Name your workout.');
      return;
    }
    if (rows.length === 0) {
      setValidationError('Add at least one exercise.');
      return;
    }
    const body = {
      title: title.trim(),
      type,
      category,
      exercises: rows.map(({ _key, ...rest }) => rest),
    };
    if (isEdit && workoutId) {
      updateWorkout.mutate(
        { id: workoutId, body },
        {
          onSuccess: (w) => navigate(`/workouts/${w.id}`),
          onError: (e) => setValidationError(e instanceof ApiError ? e.message : 'Could not save.'),
        }
      );
    } else {
      createWorkout.mutate(body, {
        onSuccess: (w) => navigate(`/workouts/${w.id}`),
        onError: (e) => setValidationError(e instanceof ApiError ? e.message : 'Could not save.'),
      });
    }
  }

  function handleCancel() {
    if (isDirty) {
      setConfirmCancel(true);
    } else {
      navigate(isEdit && workoutId ? `/workouts/${workoutId}` : '/workouts');
    }
  }

  if (isEdit && isLoading) {
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <Spinner label="Loading workout…" />
      </div>
    );
  }
  if (isEdit && (isError || !existing)) {
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Workout not found.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const saving = createWorkout.isPending || updateWorkout.isPending;

  return (
    <div className="px-5 pb-24 pt-6 sm:px-9 sm:pt-8 sm:pb-10">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-faint">Build</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-[38px]">
            {isEdit ? existing?.title || 'Edit workout' : 'New workout'}
          </h1>
        </div>
        <div className="flex flex-none gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl bg-panel2 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-panel2/70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save workout'}
          </button>
        </div>
      </div>

      {validationError && (
        <p className="mt-3 rounded-lg bg-status-missedBg px-4 py-2.5 text-sm font-medium text-status-missed">
          {validationError}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-6 sm:flex-row">
        <div className="flex flex-1 flex-col gap-4 sm:gap-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name your workout"
            aria-label="Workout name"
            className="rounded-xl bg-panel px-4 py-3.5 text-lg font-semibold text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 sm:text-xl"
          />

          <div className="flex flex-wrap items-center gap-2">
            {WORKOUT_TYPES.map((t) => (
              <Chip key={t} label={t} active={type === t} onClick={() => setType(t)} />
            ))}
            <span className="ml-auto text-[13px] font-medium text-ink-faint">
              {rows.length} exercise{rows.length === 1 ? '' : 's'} · ~{liveEstimate} min
            </span>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Category</div>
            <div className="flex flex-wrap gap-2">
              {WORKOUT_CATEGORIES.map((c) => (
                <Chip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Exercises</div>
            <div className="flex flex-col gap-2.5">
              {rows.map((row, i) => {
                const ex = exerciseMap[row.exercise_id];
                return (
                  <div
                    key={row._key}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex === null || dragIndex === i) return;
                      setRows((r) => {
                        const next = [...r];
                        const [moved] = next.splice(dragIndex, 1);
                        next.splice(i, 0, moved);
                        return next;
                      });
                      setDragIndex(null);
                    }}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-black/[.08] bg-white p-3.5"
                  >
                    <span className="hidden cursor-grab sm:block">
                      <DragIcon />
                    </span>
                    <div className="flex sm:hidden flex-col gap-0.5">
                      <button
                        type="button"
                        aria-label="Move up"
                        onClick={() => moveRow(i, -1)}
                        disabled={i === 0}
                        className="text-ink-faint disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        onClick={() => moveRow(i, 1)}
                        disabled={i === rows.length - 1}
                        className="text-ink-faint disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </div>
                    <div
                      className="h-9 w-9 flex-none rounded-lg"
                      style={{ backgroundColor: ex ? categoryColor(ex.category) : '#C4BBAD' }}
                    />
                    <div className="min-w-[120px] flex-1">
                      <div className="text-[14.5px] font-semibold text-ink">
                        {ex?.name ?? 'Removed exercise'}
                      </div>
                      <div className="text-xs text-ink-muted">{ex?.muscles_worked?.join(' · ') ?? '—'}</div>
                    </div>
                    <Stepper
                      label="Sets"
                      value={row.sets}
                      onChange={(v) => updateRow(row._key, { sets: Math.max(1, v) })}
                    />
                    <RepsStepper
                      value={row.reps}
                      onChange={(v) => updateRow(row._key, { reps: v })}
                    />
                    <Stepper
                      label="Rest"
                      unit="s"
                      value={row.rest}
                      step={15}
                      onChange={(v) => updateRow(row._key, { rest: Math.max(0, v) })}
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(row._key)}
                      aria-label={`Remove ${ex?.name ?? 'exercise'}`}
                      className="ml-auto text-sm font-semibold text-status-missed hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setLibraryOpen(true)}
                className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-[#D3CABA] p-3.5 text-sm font-semibold text-[#8A857C] hover:bg-panel/40"
              >
                <PlusIcon size={17} />
                Add exercise
              </button>
            </div>
          </div>
        </div>

        {/* Desktop library sidebar */}
        <div className="hidden w-[300px] flex-none flex-col gap-3.5 rounded-2xl border border-black/[.06] bg-sidebar p-4.5 sm:flex">
          <LibraryPanelContent
            query={libraryQuery}
            setQuery={setLibraryQuery}
            exercises={filteredLibrary}
            onAdd={addExercise}
            onCreateNew={() => setQuickCreateOpen(true)}
          />
        </div>
      </div>

      {/* Phone "Add exercise" sheet */}
      {libraryOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:hidden" onClick={() => setLibraryOpen(false)}>
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/10" />
            <LibraryPanelContent
              query={libraryQuery}
              setQuery={setLibraryQuery}
              exercises={filteredLibrary}
              onAdd={addExercise}
              onCreateNew={() => setQuickCreateOpen(true)}
            />
          </div>
        </div>
      )}

      {quickCreateOpen && (
        <QuickCreateExercise
          onClose={() => setQuickCreateOpen(false)}
          onCreated={(ex) => {
            addExercise(ex);
            setQuickCreateOpen(false);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Discard unsaved changes?"
        message="You'll lose the changes you made to this workout."
        confirmLabel="Discard"
        danger
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => navigate(isEdit && workoutId ? `/workouts/${workoutId}` : '/workouts')}
      />
    </div>
  );
}

function LibraryPanelContent({
  query,
  setQuery,
  exercises,
  onAdd,
  onCreateNew,
}: {
  query: string;
  setQuery: (v: string) => void;
  exercises: Exercise[];
  onAdd: (ex: Exercise) => void;
  onCreateNew: () => void;
}) {
  return (
    <>
      <div className="text-[15px] font-bold text-ink">Exercise library</div>
      <label className="flex items-center gap-2.5 rounded-xl border border-black/5 bg-white px-3.5 py-2.5 text-ink-faint">
        <SearchIcon size={15} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises"
          aria-label="Search exercises"
          className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </label>
      <div className="flex max-h-[360px] flex-col gap-2.5 overflow-y-auto">
        {exercises.length === 0 && <p className="text-sm text-ink-muted">No exercises found.</p>}
        {exercises.map((ex) => (
          <div key={ex.id} className="flex items-center gap-2.5">
            <div className="h-9 w-9 flex-none rounded-lg" style={{ backgroundColor: categoryColor(ex.category) }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-ink">{ex.name}</div>
              <div className="truncate text-xs text-ink-muted">{ex.muscles_worked.join(' · ') || '—'}</div>
            </div>
            <button
              type="button"
              onClick={() => onAdd(ex)}
              aria-label={`Add ${ex.name}`}
              className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-panel2 text-ink-secondary hover:bg-panel2/70"
            >
              <PlusIcon size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onCreateNew}
        className="mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-black/15 py-2.5 text-sm font-semibold text-ink-secondary hover:bg-white"
      >
        <PlusIcon size={14} />
        Create new exercise
      </button>
    </>
  );
}

function Stepper({
  label,
  value,
  onChange,
  unit = '',
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
}) {
  return (
    <div className="flex-none rounded-lg bg-panel px-2 py-1.5 text-center">
      <div className="text-[10px] text-ink-faint">{label}</div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(value - step)}
          className="text-xs font-bold text-ink-muted"
        >
          −
        </button>
        <span className="min-w-[24px] text-sm font-bold text-ink">
          {value}
          {unit}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(value + step)}
          className="text-xs font-bold text-ink-muted"
        >
          +
        </button>
      </div>
    </div>
  );
}

function RepsStepper({
  value,
  onChange,
}: {
  value: string | number;
  onChange: (v: string | number) => void;
}) {
  return (
    <div className="flex-none rounded-lg bg-panel px-2.5 py-1.5 text-center">
      <div className="text-[10px] text-ink-faint">Reps</div>
      <input
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Reps"
        className="w-14 bg-transparent text-center text-sm font-bold text-ink focus:outline-none"
      />
    </div>
  );
}
