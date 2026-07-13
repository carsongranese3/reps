import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEquipmentList } from '../hooks/useEquipment';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { EquipmentIcon, PlusIcon, SearchIcon } from '../components/icons';
import { gymGradient } from '../lib/category';
import { ApiError } from '../api';

export function EquipmentPage() {
  const [q, setQ] = useState('');
  const { data, isLoading, isError, error, refetch } = useEquipmentList(q || undefined);

  return (
    <div className="px-5 pb-10 pt-6 sm:px-9 sm:pt-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-faint">Library</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-[38px]">Equipment</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <label className="flex w-full items-center gap-2.5 rounded-xl border border-black/5 bg-panel2 px-3.5 py-2.5 text-ink-faint sm:w-[290px]">
            <SearchIcon />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search equipment…"
              aria-label="Search equipment"
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </label>
          <Link
            to="/equipment/new"
            className="flex flex-none items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
          >
            <PlusIcon size={16} />
            <span className="hidden sm:inline">New equipment</span>
          </Link>
        </div>
      </div>

      {isLoading && <Spinner label="Loading equipment…" />}
      {isError && (
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load equipment.'}
          onRetry={() => refetch()}
        />
      )}

      {data && data.length === 0 && q === '' && (
        <div className="mt-6">
          <EmptyState
            title="No equipment yet"
            message="Add the gear you train with so it shows up when building exercises and gyms."
            action={
              <Link
                to="/equipment/new"
                className="mt-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
              >
                New equipment
              </Link>
            }
          />
        </div>
      )}

      {data && data.length === 0 && q !== '' && (
        <div className="mt-6">
          <EmptyState
            title="No equipment matches"
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
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((item) => (
            <Link
              key={item.id}
              to={`/equipment/${item.id}/edit`}
              className="flex flex-col gap-2.5 rounded-card border border-black/[.06] bg-white p-3.5 hover:bg-panel/30"
            >
              <div
                className="relative flex h-20 items-center justify-center overflow-hidden rounded-lg text-white"
                style={{ background: gymGradient(item.name) }}
              >
                <EquipmentIcon size={26} />
                {item.image && (
                  <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    className={`absolute inset-0 h-full w-full ${
                      item.image_fit === 'fill' ? 'object-fill' : 'object-cover'
                    }`}
                    style={
                      item.image_fit === 'fill'
                        ? undefined
                        : {
                            objectPosition: item.image_pos ?? '50% 50%',
                            transform: `scale(${item.image_zoom ?? 1})`,
                            transformOrigin: item.image_pos ?? '50% 50%',
                          }
                    }
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </div>
              <div className="truncate text-sm font-semibold text-ink">{item.name}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
