import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGyms, useUpdateGym } from '../hooks/useGyms';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { HeartIcon, PlusIcon, SearchIcon } from '../components/icons';
import { gymGradient } from '../lib/category';
import { ApiError } from '../api';
import type { Gym } from '../types';

function GymCard({ gym }: { gym: Gym }) {
  const updateGym = useUpdateGym();
  const count = gym.equipment.length;
  return (
    <Link to={`/gyms/${gym.id}`} className="group flex flex-col gap-2.5">
      <div
        className="relative h-[140px] overflow-hidden rounded-card sm:h-[152px]"
        style={{ background: gymGradient(gym.name) }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            updateGym.mutate({ id: gym.id, body: { favorite: !gym.favorite } });
          }}
          aria-label={gym.favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={gym.favorite}
          className="absolute right-2.5 top-2.5 flex h-[31px] w-[31px] items-center justify-center rounded-full bg-white/80 backdrop-blur"
        >
          <HeartIcon filled={gym.favorite} />
        </button>
      </div>
      <div>
        <div className="text-[15.5px] font-semibold text-ink">{gym.name}</div>
        <div className="mt-0.5 text-[13px] text-ink-muted">{count} equipment</div>
      </div>
    </Link>
  );
}

export function GymsPage() {
  const [q, setQ] = useState('');
  const { data, isLoading, isError, error, refetch } = useGyms({ q: q || undefined });

  const count = data?.length ?? 0;

  return (
    <div className="px-5 pb-10 pt-6 sm:px-9 sm:pt-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-faint">
            My Training
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-[38px]">Gyms</h1>
            <span className="text-sm text-ink-muted sm:hidden">{count}</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <label className="relative flex w-full items-center gap-2.5 rounded-xl border border-black/5 bg-panel2 px-3.5 py-2.5 text-ink-faint sm:w-[290px]">
            <SearchIcon />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search gyms…"
              aria-label="Search gyms"
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </label>
          <Link
            to="/gyms/new"
            className="flex flex-none items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
          >
            <PlusIcon size={16} />
            <span className="hidden sm:inline">New gym</span>
          </Link>
        </div>
      </div>

      {isLoading && <Spinner label="Loading gyms…" />}
      {isError && (
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load gyms.'}
          onRetry={() => refetch()}
        />
      )}

      {data && data.length === 0 && q === '' && (
        <div className="mt-6">
          <EmptyState
            title="No gyms yet"
            message="Add your first gym and its equipment."
            action={
              <Link
                to="/gyms/new"
                className="mt-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
              >
                Add your first gym
              </Link>
            }
          />
        </div>
      )}

      {data && data.length === 0 && q !== '' && (
        <div className="mt-6">
          <EmptyState
            title="No gyms match"
            message="Try a different search term."
            action={
              <button
                type="button"
                onClick={() => setQ('')}
                className="mt-2 rounded-lg bg-panel2 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-panel2/70"
              >
                Clear search
              </button>
            }
          />
        </div>
      )}

      {data && data.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-[22px]">
          {data.map((g) => (
            <GymCard key={g.id} gym={g} />
          ))}
        </div>
      )}
    </div>
  );
}
