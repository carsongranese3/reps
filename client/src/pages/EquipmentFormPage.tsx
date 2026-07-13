import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useCreateEquipment,
  useDeleteEquipment,
  useEquipment,
  useEquipmentList,
  useUpdateEquipment,
} from '../hooks/useEquipment';
import { Spinner } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Chip } from '../components/ui/Chip';
import { TrashIcon } from '../components/icons';
import { ApiError } from '../api';

export function EquipmentFormPage() {
  const { equipmentId } = useParams<{ equipmentId: string }>();
  const isEdit = !!equipmentId;
  const navigate = useNavigate();
  const { data: existing, isLoading, isError, error, refetch } = useEquipment(equipmentId);
  const { data: allEquipment } = useEquipmentList();
  const createEquipment = useCreateEquipment();
  const updateEquipment = useUpdateEquipment();
  const deleteEquipment = useDeleteEquipment();

  const [name, setName] = useState('');
  const [substitutes, setSubstitutes] = useState<string[]>([]);
  const [image, setImage] = useState('');
  const [posX, setPosX] = useState(50); // object-position X %, for adjusting the cover crop
  const [posY, setPosY] = useState(50); // object-position Y %
  const [zoom, setZoom] = useState(1); // cover scale
  const [fit, setFit] = useState<'cover' | 'fill'>('cover'); // 'fill' = stretch/warp to the tile
  const [imgFailed, setImgFailed] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number; w: number; h: number } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(!isEdit);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isEdit && existing && !hydrated) {
      setName(existing.name);
      setSubstitutes(existing.substitutes ?? []);
      setImage(existing.image ?? '');
      const m = (existing.image_pos ?? '').match(/(\d+)%\s+(\d+)%/);
      if (m) {
        setPosX(Number(m[1]));
        setPosY(Number(m[2]));
      }
      if (existing.image_zoom) setZoom(existing.image_zoom);
      if (existing.image_fit === 'fill') setFit('fill');
      setHydrated(true);
    }
  }, [isEdit, existing, hydrated]);

  const hasUrl = /^https?:\/\//i.test(image.trim());
  const objectPosition = `${posX}% ${posY}%`;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  // Drag the preview to reposition the crop (updates object-position).
  function onDragStart(e: React.PointerEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { x: e.clientX, y: e.clientY, px: posX, py: posY, w: rect.width, h: rect.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onDragMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = ((e.clientX - d.x) / d.w) * 100;
    const dy = ((e.clientY - d.y) / d.h) * 100;
    setPosX(clamp(d.px - dx, 0, 100));
    setPosY(clamp(d.py - dy, 0, 100));
  }
  function onDragEnd() {
    dragRef.current = null;
  }

  // Scroll over the preview to shrink/zoom (non-passive so it doesn't scroll the page).
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(Number((z - e.deltaY * 0.0015).toFixed(2)), 0.5, 3));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [hasUrl, imgFailed, fit]);

  // Other equipment this item can be marked as "also counting as" — the full managed
  // list, minus the item being edited (case-insensitive), sorted by name.
  const otherEquipmentNames = useMemo(() => {
    const selfName = isEdit ? existing?.name.trim().toLowerCase() : undefined;
    return (allEquipment ?? [])
      .map((e) => e.name)
      .filter((n) => !selfName || n.trim().toLowerCase() !== selfName)
      .sort((a, b) => a.localeCompare(b));
  }, [allEquipment, isEdit, existing]);

  function toggleSubstitute(otherName: string) {
    setSubstitutes((subs) =>
      subs.some((s) => s.toLowerCase() === otherName.toLowerCase())
        ? subs.filter((s) => s.toLowerCase() !== otherName.toLowerCase())
        : [...subs, otherName]
    );
  }

  if (isEdit && isLoading) {
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <Spinner label="Loading equipment…" />
      </div>
    );
  }
  if (isEdit && (isError || !existing)) {
    return (
      <div className="px-5 pt-6 sm:px-9 sm:pt-8">
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Equipment not found.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const saving = createEquipment.isPending || updateEquipment.isPending;

  function handleSave() {
    setFormError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('Name this equipment.');
      return;
    }
    if (isEdit && equipmentId) {
      updateEquipment.mutate(
        {
          id: equipmentId,
          body: {
            name: trimmed,
            substitutes,
            image: image.trim() || null,
            image_pos: image.trim() ? objectPosition : null,
            image_zoom: image.trim() ? zoom : null,
            image_fit: image.trim() ? fit : null,
          },
        },
        {
          onSuccess: () => navigate('/equipment'),
          onError: (e) =>
            setFormError(
              e instanceof ApiError && e.status === 400
                ? 'That equipment already exists.'
                : e instanceof ApiError
                  ? e.message
                  : 'Could not save this equipment.'
            ),
        }
      );
    } else {
      createEquipment.mutate(
        {
          name: trimmed,
          substitutes,
          image: image.trim() || null,
          image_pos: image.trim() ? objectPosition : null,
          image_zoom: image.trim() ? zoom : null,
          image_fit: image.trim() ? fit : null,
        },
        {
          onSuccess: () => navigate('/equipment'),
          onError: (e) =>
            setFormError(
              e instanceof ApiError && e.status === 400
                ? 'That equipment already exists.'
                : e instanceof ApiError
                  ? e.message
                  : 'Could not save this equipment.'
            ),
        }
      );
    }
  }

  return (
    <div className="mx-auto max-w-xl px-5 pb-20 pt-6 sm:px-9 sm:pt-8">
      <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-faint">
        {isEdit ? 'Edit equipment' : 'New equipment'}
      </div>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
        {isEdit ? existing?.name : 'New equipment'}
      </h1>

      {formError && (
        <p role="alert" className="mt-4 rounded-lg bg-status-missedBg px-4 py-2.5 text-sm text-status-missed">
          {formError}
        </p>
      )}

      <div className="mt-5">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-secondary">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Foam Roller"
            aria-label="Equipment name"
            className="rounded-xl bg-panel px-4 py-3 text-base font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
      </div>

      <div className="mt-5">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-secondary">
          Cover photo link
          <input
            value={image}
            onChange={(e) => {
              setImage(e.target.value);
              setImgFailed(false);
            }}
            placeholder="https://…/photo.jpg"
            aria-label="Cover photo URL"
            className="rounded-xl bg-panel px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>

        {hasUrl && !imgFailed && (
          <div className="mt-3">
            <div className="mb-2 flex gap-2">
              <Chip label="Crop" active={fit === 'cover'} onClick={() => setFit('cover')} />
              <Chip label="Stretch to fit" active={fit === 'fill'} onClick={() => setFit('fill')} />
            </div>

            {fit === 'fill' ? (
              <>
                <div className="aspect-[5/2] w-full overflow-hidden rounded-xl bg-panel">
                  <img
                    src={image.trim()}
                    alt="Cover preview"
                    className="h-full w-full object-fill"
                    onError={() => setImgFailed(true)}
                    onLoad={() => setImgFailed(false)}
                  />
                </div>
                <p className="mt-2 text-xs text-ink-faint">
                  The whole image is stretched to fill the tile (may distort).
                </p>
              </>
            ) : (
              <>
                {/* Same aspect as the Equipment tile — drag to reposition, scroll/± to zoom. */}
                <div
                  ref={previewRef}
                  onPointerDown={onDragStart}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragEnd}
                  onPointerCancel={onDragEnd}
                  className="aspect-[5/2] w-full cursor-grab touch-none select-none overflow-hidden rounded-xl bg-panel active:cursor-grabbing"
                >
                  <img
                    src={image.trim()}
                    alt="Cover preview"
                    draggable={false}
                    className="pointer-events-none h-full w-full object-cover"
                    style={{ objectPosition, transform: `scale(${zoom})`, transformOrigin: objectPosition }}
                    onError={() => setImgFailed(true)}
                    onLoad={() => setImgFailed(false)}
                  />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-ink-faint">
                  <span>Drag to reposition · scroll or</span>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => clamp(Number((z - 0.1).toFixed(2)), 0.5, 3))}
                    aria-label="Zoom out"
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-panel2 text-sm font-bold text-ink hover:bg-panel2/70"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => clamp(Number((z + 0.1).toFixed(2)), 0.5, 3))}
                    aria-label="Zoom in"
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-panel2 text-sm font-bold text-ink hover:bg-panel2/70"
                  >
                    +
                  </button>
                  <span>to zoom</span>
                </div>
              </>
            )}
          </div>
        )}
        {hasUrl && imgFailed && (
          <p className="mt-2 text-xs text-status-missed">
            Couldn't load that image — make sure the link points directly to an image file (ends in
            .jpg/.png/.webp), not a web page.
          </p>
        )}
      </div>

      <div className="mt-6">
        <div className="text-sm font-semibold text-ink-secondary">Also counts as</div>
        <p className="mt-0.5 text-xs text-ink-faint">
          A gym with this equipment also covers these (e.g. an adjustable bench covers a flat
          bench).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {otherEquipmentNames.map((otherName) => (
            <Chip
              key={otherName}
              label={otherName}
              active={substitutes.some((s) => s.toLowerCase() === otherName.toLowerCase())}
              onClick={() => toggleSubstitute(otherName)}
            />
          ))}
        </div>
        {otherEquipmentNames.length === 0 && (
          <p className="mt-2 text-xs text-ink-faint">
            Add other equipment first to mark substitutes here.
          </p>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <div>
          {isEdit && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-2 rounded-xl bg-status-missedBg px-4 py-2.5 text-sm font-semibold text-status-missed hover:bg-status-missedBg/70"
            >
              <TrashIcon size={15} />
              Delete
            </button>
          )}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/equipment')}
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
            {saving ? 'Saving…' : 'Save equipment'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this equipment?"
        message="It will stop appearing as a suggestion in exercise and gym forms. This can't be undone."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!equipmentId) return;
          deleteEquipment.mutate(equipmentId, {
            onSuccess: () => navigate('/equipment'),
          });
        }}
      />
    </div>
  );
}
