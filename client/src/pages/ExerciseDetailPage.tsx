import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useDeleteExercise, useExercise } from '../hooks/useExercises';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EditIcon, PlayIcon, TrashIcon } from '../components/icons';
import { categoryColor } from '../lib/category';
import { MuscleMap } from '../components/MuscleMap';
import { exerciseIntensities, hasMappableMuscles } from '../lib/muscles';
import { exerciseDemoUrl } from '../api';
import { ApiError } from '../api';
import { parseYouTubeId, youTubeEmbedUrl } from '../lib/youtube';

interface NavState {
  from?: string;
  fromLabel?: string;
  prescription?: { sets: number; reps: string | number; rest: number };
}

export function ExerciseDetailPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state as NavState) ?? {};
  const { data: ex, isLoading, isError, error, refetch } = useExercise(exerciseId);
  const deleteExercise = useDeleteExercise();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [playing, setPlaying] = useState(false);
  const youTubeId = ex ? parseYouTubeId(ex.video_url) : null;
  const muscleIntensities = ex ? exerciseIntensities(ex.muscles_worked ?? []) : {};
  const showMuscleMap = hasMappableMuscles(muscleIntensities);

  if (isLoading) {
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <Spinner label="Loading exercise…" />
      </div>
    );
  }

  if (isError || !ex) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <ErrorState
          message={notFound ? 'This exercise no longer exists.' : 'Could not load this exercise.'}
          onRetry={notFound ? undefined : () => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 pb-10 pt-6 sm:px-9 sm:pt-8">
      <Link to={navState.from ?? '/exercises'} className="text-sm font-medium text-ink-muted hover:text-ink">
        &larr; {navState.fromLabel ?? 'Exercises'}
      </Link>

      <div className="relative mt-4 aspect-video overflow-hidden rounded-2xl bg-panel">
        {ex.has_demo ? (
          playing ? (
            <video
              src={exerciseDemoUrl(ex.id)}
              controls
              autoPlay
              className="h-full w-full object-cover"
              aria-label={`${ex.name} demo`}
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="flex h-full w-full items-center justify-center"
              style={{ backgroundColor: categoryColor(ex.category) }}
              aria-label={`Play ${ex.name} demo`}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90">
                <PlayIcon size={22} color="#1A1815" />
              </span>
            </button>
          )
        ) : ex.video_url ? (
          <div className="flex h-full w-full flex-col">
            <div className="flex-1">
              {youTubeId ? (
                <iframe
                  src={youTubeEmbedUrl(youTubeId)}
                  title={`${ex.name} video`}
                  className="h-full w-full"
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <a
                  href={ex.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-faint hover:bg-panel/60"
                  style={{ backgroundColor: categoryColor(ex.category) }}
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90">
                    <PlayIcon size={22} color="#1A1815" />
                  </span>
                  <span className="text-sm font-semibold text-white">Watch on YouTube ↗</span>
                </a>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 bg-panel2 px-3 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                Video
              </span>
              <a
                href={ex.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-none text-xs font-semibold text-accent hover:underline"
              >
                YouTube ↗
              </a>
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-faint">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: categoryColor(ex.category) }}
            >
              <PlayIcon size={20} />
            </div>
            <span className="text-sm font-medium">No video yet</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink sm:text-[26px]">{ex.name}</h1>
        <div className="flex flex-none gap-2">
          <Link
            to={`/exercises/${ex.id}/edit`}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-panel2 text-ink-secondary hover:bg-panel2/70"
            aria-label="Edit exercise"
          >
            <EditIcon />
          </Link>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-status-missedBg text-status-missed hover:bg-status-missedBg/70"
            aria-label="Delete exercise"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <dl className="mt-4 flex flex-col gap-2 text-sm">
        {[
          { label: 'Category', value: ex.category },
          { label: 'Equipment', value: ex.equipment && ex.equipment !== 'Bodyweight' ? ex.equipment : null },
          { label: 'Difficulty', value: ex.difficulty },
          { label: 'Muscles', value: ex.muscles_worked.join(' · ') || null },
        ]
          .filter((row) => row.value)
          .map((row) => (
            <div key={row.label} className="flex gap-3">
              <dt className="w-24 flex-none font-semibold text-ink-faint">{row.label}</dt>
              <dd className="font-medium text-ink">{row.value}</dd>
            </div>
          ))}
      </dl>

      {showMuscleMap && (
        <div className="mt-5 rounded-2xl bg-panel p-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-faint">Muscles worked</h2>
          <MuscleMap view="both" intensities={muscleIntensities} className="mt-3 h-[172px]" />
        </div>
      )}

      <div className="mb-3 mt-6 text-xs font-bold uppercase tracking-wide text-ink-faint">How to</div>
      {ex.how_to.length === 0 ? (
        <p className="text-sm text-ink-muted">No steps yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {ex.how_to.map((step, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">
                {i + 1}
              </div>
              <p className="text-[13px] leading-relaxed text-[#4A453D]">{step}</p>
            </div>
          ))}
        </div>
      )}

      {(navState.prescription || ex.last_time) && (
        <div className="mt-5 rounded-xl bg-[#F4EEE6] p-4">
          {navState.prescription && (
            <>
              <div className="text-[11px] font-bold text-accent">IN THIS WORKOUT</div>
              <div className="mt-0.5 text-sm font-bold text-ink">
                {navState.prescription.sets} sets × {navState.prescription.reps} reps ·{' '}
                {navState.prescription.rest}s rest
              </div>
            </>
          )}
          {ex.last_time && (
            <div className={`text-xs text-ink-muted ${navState.prescription ? 'mt-1' : ''}`}>
              Last time: {ex.last_time.weight ?? '—'} lb × {ex.last_time.reps ?? '—'}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this exercise?"
        message="Workouts that reference it will show a removed-exercise placeholder. Past sessions keep their logged history."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteExercise.mutate(ex.id, { onSuccess: () => navigate('/exercises') });
        }}
      />
    </div>
  );
}
