import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useCreateExercise,
  useExercise,
  useUpdateExercise,
  useUploadExerciseDemo,
} from '../hooks/useExercises';
import { uploadExerciseDemoDraft, ApiError } from '../api';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { Chip } from '../components/ui/Chip';
import { PlusIcon } from '../components/icons';
import { WORKOUT_CATEGORIES } from '../lib/category';
import type { WorkoutCategory } from '../types';

export function ExerciseFormPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const isEdit = !!exerciseId;
  const navigate = useNavigate();
  const { data: existing, isLoading, isError, error, refetch } = useExercise(exerciseId);
  const createExercise = useCreateExercise();
  const updateExercise = useUpdateExercise();
  const uploadDemo = useUploadExerciseDemo();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<WorkoutCategory>('Strength');
  const [equipment, setEquipment] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [muscles, setMuscles] = useState<string[]>([]);
  const [muscleInput, setMuscleInput] = useState('');
  const [steps, setSteps] = useState<string[]>(['']);
  const [demoFile, setDemoFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(!isEdit);

  useEffect(() => {
    if (isEdit && existing && !hydrated) {
      setName(existing.name);
      setCategory((existing.category as WorkoutCategory) ?? 'Strength');
      setEquipment(existing.equipment ?? '');
      setDifficulty(existing.difficulty ?? '');
      setMuscles(existing.muscles_worked);
      setSteps(existing.how_to.length ? existing.how_to : ['']);
      setHydrated(true);
    }
  }, [isEdit, existing, hydrated]);

  if (isEdit && isLoading) {
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <Spinner label="Loading exercise…" />
      </div>
    );
  }
  if (isEdit && (isError || !existing)) {
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Exercise not found.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  function addMuscle() {
    const v = muscleInput.trim();
    if (v && !muscles.includes(v)) setMuscles((m) => [...m, v]);
    setMuscleInput('');
  }

  const saving = createExercise.isPending || updateExercise.isPending || uploadDemo.isPending;

  async function handleSave() {
    setFormError(null);
    if (!name.trim()) {
      setFormError('Name your exercise.');
      return;
    }
    const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);
    const body = {
      name: name.trim(),
      category,
      equipment: equipment.trim() || null,
      difficulty: difficulty.trim() || null,
      muscles_worked: muscles,
      how_to: cleanSteps,
    };
    try {
      if (isEdit && exerciseId) {
        await updateExercise.mutateAsync({ id: exerciseId, body });
        if (demoFile) {
          await uploadDemo.mutateAsync({ id: exerciseId, file: demoFile });
        }
        navigate(`/exercises/${exerciseId}`);
      } else {
        let draftToken: string | undefined;
        if (demoFile) {
          const draft = await uploadExerciseDemoDraft(demoFile);
          draftToken = draft.draft_token;
        }
        const created = await createExercise.mutateAsync({ ...body, draft_token: draftToken });
        navigate(`/exercises/${created.id}`);
      }
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not save this exercise.');
    }
  }

  return (
    <div className="mx-auto max-w-xl px-5 pb-20 pt-6 sm:px-9 sm:pt-8">
      <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-faint">
        {isEdit ? 'Edit exercise' : 'New exercise'}
      </div>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
        {isEdit ? existing?.name : 'New exercise'}
      </h1>

      {formError && (
        <p className="mt-4 rounded-lg bg-status-missedBg px-4 py-2.5 text-sm text-status-missed">{formError}</p>
      )}

      <div className="mt-5 flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-secondary">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl bg-panel px-4 py-3 text-base font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            placeholder="e.g. Barbell Bench Press"
          />
        </label>

        <div>
          <div className="mb-2 text-sm font-semibold text-ink-secondary">Category</div>
          <div className="flex flex-wrap gap-2">
            {WORKOUT_CATEGORIES.map((c) => (
              <Chip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-secondary">
            Equipment
            <input
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              className="rounded-xl bg-panel px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="Barbell"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-secondary">
            Difficulty
            <input
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="rounded-xl bg-panel px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="Intermediate"
            />
          </label>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-ink-secondary">Muscles worked</div>
          <div className="flex flex-wrap items-center gap-2">
            {muscles.map((m) => (
              <span
                key={m}
                className="flex items-center gap-1.5 rounded-lg bg-panel2 px-2.5 py-1 text-xs font-semibold text-ink-secondary"
              >
                {m}
                <button
                  type="button"
                  onClick={() => setMuscles((ms) => ms.filter((x) => x !== m))}
                  aria-label={`Remove ${m}`}
                  className="text-ink-faint hover:text-ink"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={muscleInput}
              onChange={(e) => setMuscleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addMuscle();
                }
              }}
              onBlur={addMuscle}
              placeholder="Add and press Enter"
              className="min-w-[140px] flex-1 rounded-lg bg-panel px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-ink-secondary">How to (ordered steps)</div>
          <div className="flex flex-col gap-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 flex-none text-xs font-bold text-ink-faint">{i + 1}</span>
                <input
                  value={step}
                  onChange={(e) =>
                    setSteps((s) => s.map((v, idx) => (idx === i ? e.target.value : v)))
                  }
                  placeholder={`Step ${i + 1}`}
                  className="flex-1 rounded-lg bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <button
                  type="button"
                  onClick={() => setSteps((s) => s.filter((_, idx) => idx !== i))}
                  aria-label={`Remove step ${i + 1}`}
                  className="text-xs font-semibold text-status-missed hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSteps((s) => [...s, ''])}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-black/15 py-2 text-sm font-semibold text-ink-secondary hover:bg-panel/40"
            >
              <PlusIcon size={14} />
              Add step
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-ink-secondary">
            Demo clip {isEdit && existing?.has_demo ? '(replaces the current one)' : '(optional)'}
          </div>
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,image/gif,image/png,image/jpeg,image/webp"
            onChange={(e) => setDemoFile(e.target.files?.[0] ?? null)}
            aria-label="Upload demo clip"
            className="text-sm text-ink-muted"
          />
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => navigate(isEdit && exerciseId ? `/exercises/${exerciseId}` : '/exercises')}
          className="rounded-xl bg-panel2 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-panel2/70"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save exercise'}
        </button>
      </div>
    </div>
  );
}
