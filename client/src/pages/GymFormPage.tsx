import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCreateGym, useGym, useUpdateGym } from '../hooks/useGyms';
import { useEquipmentList } from '../hooks/useEquipment';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Chip } from '../components/ui/Chip';
import { HeartIcon, PlusIcon, XIcon } from '../components/icons';
import { ApiError } from '../api';

export function GymFormPage() {
  const { gymId } = useParams<{ gymId: string }>();
  const isEdit = !!gymId;
  const navigate = useNavigate();
  const { data: existing, isLoading, isError, error, refetch } = useGym(gymId);
  const createGym = useCreateGym();
  const updateGym = useUpdateGym();
  const { data: equipmentList } = useEquipmentList();
  const managedEquipmentNames = useMemo(
    () => equipmentList?.map((e) => e.name) ?? [],
    [equipmentList]
  );

  const [name, setName] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [hydrated, setHydrated] = useState(!isEdit);

  useEffect(() => {
    if (isEdit && existing && !hydrated) {
      setName(existing.name);
      setFavorite(existing.favorite);
      setEquipment(existing.equipment);
      setHydrated(true);
    }
  }, [isEdit, existing, hydrated]);

  const customItems = useMemo(
    () => equipment.filter((item) => !managedEquipmentNames.includes(item)),
    [equipment, managedEquipmentNames]
  );

  const isDirty = useMemo(() => {
    if (!isEdit) return name.trim() !== '' || favorite || equipment.length > 0;
    if (!existing) return false;
    if (name !== existing.name || favorite !== existing.favorite) return true;
    if (equipment.length !== existing.equipment.length) return true;
    return equipment.some((e, i) => e !== existing.equipment[i]);
  }, [isEdit, existing, name, favorite, equipment]);

  function toggleEquipment(item: string) {
    setEquipment((eq) => (eq.includes(item) ? eq.filter((e) => e !== item) : [...eq, item]));
  }

  function addCustom() {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    setEquipment((eq) => {
      if (eq.some((e) => e.toLowerCase() === trimmed.toLowerCase())) return eq;
      return [...eq, trimmed];
    });
    setCustomInput('');
  }

  function handleSave() {
    setValidationError(null);
    if (!name.trim()) {
      setValidationError('Name your gym.');
      return;
    }
    const body = { name: name.trim(), favorite, equipment };
    if (isEdit && gymId) {
      updateGym.mutate(
        { id: gymId, body },
        {
          onSuccess: (g) => navigate(`/gyms/${g.id}`),
          onError: (e) => setValidationError(e instanceof ApiError ? e.message : 'Could not save.'),
        }
      );
    } else {
      createGym.mutate(body, {
        onSuccess: (g) => navigate(`/gyms/${g.id}`),
        onError: (e) => setValidationError(e instanceof ApiError ? e.message : 'Could not save.'),
      });
    }
  }

  function handleCancel() {
    if (isDirty) {
      setConfirmCancel(true);
    } else {
      navigate(isEdit && gymId ? `/gyms/${gymId}` : '/gyms');
    }
  }

  if (isEdit && isLoading) {
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <Spinner label="Loading gym…" />
      </div>
    );
  }
  if (isEdit && (isError || !existing)) {
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Gym not found.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const saving = createGym.isPending || updateGym.isPending;

  return (
    <div className="px-5 pb-24 pt-6 sm:px-9 sm:pt-8 sm:pb-10">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-faint">
            {isEdit ? 'Edit gym' : 'New gym'}
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-[38px]">
            {isEdit ? existing?.name || 'Edit gym' : 'New gym'}
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
            {saving ? 'Saving…' : 'Save gym'}
          </button>
        </div>
      </div>

      {validationError && (
        <p className="mt-3 rounded-lg bg-status-missedBg px-4 py-2.5 text-sm font-medium text-status-missed">
          {validationError}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name your gym"
            aria-label="Gym name"
            className="flex-1 rounded-xl bg-panel px-4 py-3.5 text-lg font-semibold text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 sm:text-xl"
          />
          <button
            type="button"
            onClick={() => setFavorite((v) => !v)}
            aria-pressed={favorite}
            aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
            className="flex h-[50px] w-[50px] flex-none items-center justify-center rounded-xl bg-panel2 hover:bg-panel2/70"
          >
            <HeartIcon filled={favorite} size={20} />
          </button>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Equipment
          </div>
          <div className="flex flex-wrap gap-2">
            {managedEquipmentNames.map((item) => (
              <Chip
                key={item}
                label={item}
                active={equipment.includes(item)}
                onClick={() => toggleEquipment(item)}
              />
            ))}
          </div>
          {managedEquipmentNames.length === 0 && (
            <p className="mt-2 text-xs text-ink-faint">
              No managed equipment yet — add some from the Equipment tab, or use "Add custom" below.
            </p>
          )}

          {customItems.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {customItems.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleEquipment(item)}
                  aria-label={`Remove ${item}`}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white"
                >
                  {item}
                  <XIcon color="#fff" size={9} />
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <input
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustom();
                }
              }}
              placeholder="Add custom equipment…"
              aria-label="Add custom equipment"
              className="flex-1 rounded-lg border border-black/10 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <button
              type="button"
              onClick={addCustom}
              className="flex items-center gap-1.5 rounded-lg bg-panel2 px-3.5 py-2.5 text-sm font-semibold text-ink hover:bg-panel2/70"
            >
              <PlusIcon size={15} />
              Add
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Discard unsaved changes?"
        message="You'll lose the changes you made to this gym."
        confirmLabel="Discard"
        danger
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => navigate(isEdit && gymId ? `/gyms/${gymId}` : '/gyms')}
      />
    </div>
  );
}
