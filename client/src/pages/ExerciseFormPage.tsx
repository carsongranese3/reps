import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAutofillExercise,
  useCreateExercise,
  useExercise,
  useUpdateExercise,
  useUploadExerciseDemo,
} from '../hooks/useExercises';
import { useEquipmentList } from '../hooks/useEquipment';
import { uploadExerciseDemoDraft, ApiError } from '../api';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { Chip } from '../components/ui/Chip';
import { PlusIcon } from '../components/icons';
import { WORKOUT_CATEGORIES } from '../lib/category';
import { parseYouTubeId, youTubeEmbedUrl } from '../lib/youtube';
import type { WorkoutCategory } from '../types';

type AutofillState = 'idle' | 'loading' | 'success';

export function ExerciseFormPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const isEdit = !!exerciseId;
  const navigate = useNavigate();
  const { data: existing, isLoading, isError, error, refetch } = useExercise(exerciseId);
  const createExercise = useCreateExercise();
  const updateExercise = useUpdateExercise();
  const uploadDemo = useUploadExerciseDemo();
  const autofill = useAutofillExercise();
  const { data: equipmentList } = useEquipmentList();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<WorkoutCategory>('Strength');
  const [equipment, setEquipment] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [muscles, setMuscles] = useState<string[]>([]);
  const [muscleInput, setMuscleInput] = useState('');
  const [steps, setSteps] = useState<string[]>(['']);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [demoFile, setDemoFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(!isEdit);

  const [autofillState, setAutofillState] = useState<AutofillState>('idle');
  const [autofillError, setAutofillError] = useState<string | null>(null);
  const [autofillUnavailable, setAutofillUnavailable] = useState(false);

  useEffect(() => {
    if (isEdit && existing && !hydrated) {
      setName(existing.name);
      setCategory((existing.category as WorkoutCategory) ?? 'Strength');
      setEquipment(existing.equipment ?? '');
      setDifficulty(existing.difficulty ?? '');
      setMuscles(existing.muscles_worked);
      setSteps(existing.how_to.length ? existing.how_to : ['']);
      setTags(existing.tags);
      setVideoUrl(existing.video_url ?? '');
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

  function addTag() {
    const v = tagInput.trim();
    if (v && !tags.includes(v)) setTags((t) => [...t, v]);
    setTagInput('');
  }

  async function handleAutofill() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setAutofillError(null);
    setAutofillState('loading');
    try {
      const { suggestion } = await autofill.mutateAsync(trimmedName);
      if (suggestion.category) setCategory(suggestion.category);
      if (suggestion.equipment) setEquipment(suggestion.equipment);
      if (suggestion.difficulty) setDifficulty(suggestion.difficulty);
      setMuscles(suggestion.muscles_worked);
      setSteps(suggestion.how_to.length ? suggestion.how_to : ['']);
      setTags(suggestion.tags);
      setVideoUrl(suggestion.video_url ?? '');
      setAutofillState('success');
    } catch (e) {
      setAutofillState('idle');
      if (e instanceof ApiError && e.status === 501) {
        setAutofillUnavailable(true);
        setAutofillError('Autofill unavailable — no API key configured on the server.');
      } else if (e instanceof ApiError && e.status === 502) {
        setAutofillError("Couldn't reach the AI service — try again or fill it in manually.");
      } else if (e instanceof ApiError && e.status === 400) {
        setAutofillError('Add a name first, then try Autofill again.');
      } else {
        setAutofillError("Couldn't reach the AI service — try again or fill it in manually.");
      }
    }
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
      tags,
      video_url: videoUrl.trim() || null,
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
        <div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-secondary">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl bg-panel px-4 py-3 text-base font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="e.g. Barbell Bench Press"
            />
          </label>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleAutofill}
              disabled={!name.trim() || autofillState === 'loading' || autofillUnavailable}
              title="Fill details from the name"
              className="flex items-center gap-1.5 rounded-lg bg-panel2 px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-panel2/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden="true">✨</span>
              {autofillState === 'loading' ? 'Autofilling…' : 'Autofill with AI'}
            </button>
            {autofillState === 'success' && !autofillError && (
              <span className="text-xs font-medium text-status-done">
                Filled from AI.
              </span>
            )}
          </div>
          {autofillError && (
            <p
              role="alert"
              className={`mt-2 rounded-lg px-3 py-2 text-xs font-medium ${
                autofillUnavailable
                  ? 'bg-panel2 text-ink-muted'
                  : 'bg-status-missedBg text-status-missed'
              }`}
            >
              {autofillError}
            </p>
          )}
        </div>

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
              list="equipment-options"
              className="rounded-xl bg-panel px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="Start typing or pick…"
            />
            <datalist id="equipment-options">
              {['Bodyweight', ...(equipmentList?.map((e) => e.name) ?? [])].map((opt) => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
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
          <div className="mb-2 text-sm font-semibold text-ink-secondary">Tags</div>
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1.5 rounded-lg bg-panel2 px-2.5 py-1 text-xs font-semibold text-ink-secondary"
              >
                {t}
                <button
                  type="button"
                  onClick={() => setTags((ts) => ts.filter((x) => x !== t))}
                  aria-label={`Remove ${t}`}
                  className="text-ink-faint hover:text-ink"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              placeholder="Add and press Enter"
              className="min-w-[140px] flex-1 rounded-lg bg-panel px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
        </div>

        <div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-secondary">
            Video
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="rounded-xl bg-panel px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
          <div className="mt-1.5 flex items-center gap-3">
            <p className="text-xs text-ink-faint">
              Paste a YouTube link, or use Autofill. It plays here and becomes the exercise photo.
            </p>
            {/^https?:\/\//i.test(videoUrl.trim()) && (
              <a
                href={videoUrl.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-none text-xs font-semibold text-accent hover:underline"
              >
                Open ↗
              </a>
            )}
          </div>
          {(() => {
            const ytId = parseYouTubeId(videoUrl.trim());
            if (!ytId) return null;
            return (
              <div className="mt-3 aspect-video w-full overflow-hidden rounded-xl bg-black">
                <iframe
                  src={youTubeEmbedUrl(ytId)}
                  title="Video preview"
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            );
          })()}
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-ink-secondary">
            Video clip {isEdit && existing?.has_demo ? '(replaces the current one)' : '(optional)'}
          </div>
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,image/gif,image/png,image/jpeg,image/webp"
            onChange={(e) => setDemoFile(e.target.files?.[0] ?? null)}
            aria-label="Upload video clip"
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
