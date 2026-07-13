import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDeleteGym, useGym, useUpdateGym } from '../hooks/useGyms';
import { useWorkouts } from '../hooks/useWorkouts';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Chip } from '../components/ui/Chip';
import { EditIcon, HeartIcon, TrashIcon } from '../components/icons';
import { categoryColor, gymGradient } from '../lib/category';
import { ApiError } from '../api';

export function GymDetailPage() {
  const { gymId } = useParams<{ gymId: string }>();
  const navigate = useNavigate();
  const { data: gym, isLoading, isError, error, refetch } = useGym(gymId);
  const { data: workouts } = useWorkouts();
  const updateGym = useUpdateGym();
  const deleteGym = useDeleteGym();

  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) {
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <Spinner label="Loading gym…" />
      </div>
    );
  }
  if (isError || !gym) {
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Gym not found.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="px-5 pb-10 pt-6 sm:px-9 sm:pt-8">
      <Link to="/gyms" className="text-sm font-medium text-ink-muted hover:text-ink">
        &larr; Gyms
      </Link>

      <div
        className="relative mt-4 overflow-hidden rounded-2xl px-6 py-7"
        style={{ background: gymGradient(gym.name) }}
      >
        <button
          type="button"
          onClick={() => updateGym.mutate({ id: gym.id, body: { favorite: !gym.favorite } })}
          aria-pressed={gym.favorite}
          aria-label={gym.favorite ? 'Remove from favorites' : 'Add to favorites'}
          className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 backdrop-blur"
        >
          <HeartIcon filled={gym.favorite} />
        </button>
        <span className="text-[11px] font-bold tracking-[.1em] text-white/70">GYM</span>
        <div className="mt-1 text-[28px] font-bold text-white">{gym.name}</div>
        <div className="mt-1 text-sm text-white/85">
          {gym.equipment.length} equipment
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        <Link
          to={`/gyms/${gym.id}/edit`}
          className="flex items-center gap-2 rounded-xl bg-panel2 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-panel2/70"
        >
          <EditIcon />
          Edit
        </Link>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-2 rounded-xl bg-status-missedBg px-5 py-2.5 text-sm font-semibold text-status-missed hover:bg-status-missedBg/70"
        >
          <TrashIcon />
          Delete
        </button>
      </div>

      <h2 className="mb-3 mt-7 text-base font-bold text-ink">Equipment</h2>
      {gym.equipment.length === 0 ? (
        <p className="text-sm text-ink-muted">No equipment added yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {gym.equipment.map((item) => (
            <Chip key={item} label={item} />
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-7 text-base font-bold text-ink">Workouts here</h2>
      {(() => {
        const gymWorkouts = (workouts ?? []).filter((w) => w.gym_id === gym.id);
        if (gymWorkouts.length === 0) {
          return <p className="text-sm text-ink-muted">No workouts assigned to this gym yet.</p>;
        }
        return (
          <div className="flex flex-col gap-2.5">
            {gymWorkouts.map((w) => (
              <Link
                key={w.id}
                to={`/workouts/${w.id}`}
                className="flex items-center gap-3 rounded-xl border border-black/[.07] bg-white px-4 py-3 hover:bg-panel/30"
              >
                <span
                  className="h-8 w-8 flex-none rounded-lg"
                  style={{ backgroundColor: categoryColor(w.category) }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{w.title}</div>
                  <div className="truncate text-xs text-ink-muted">
                    {w.est_minutes} min · {w.exercise_count} exercise
                    {w.exercise_count === 1 ? '' : 's'} · {w.type}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        );
      })()}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this gym?"
        message="This can't be undone."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteGym.mutate(gym.id, {
            onSuccess: () => navigate('/gyms'),
          });
        }}
      />
    </div>
  );
}
