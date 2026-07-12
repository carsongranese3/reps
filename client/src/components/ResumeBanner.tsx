import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadActiveSession } from '../lib/activeSession';

/**
 * Surfaces a "Resume workout" affordance when an in-progress session exists in
 * localStorage (spec §2.4 Paused/abandoned state). Shown on This Week and the
 * Workouts library per the spec.
 */
export function ResumeBanner() {
  const [active, setActive] = useState(() => loadActiveSession());

  useEffect(() => {
    function onStorage() {
      setActive(loadActiveSession());
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onStorage);
    };
  }, []);

  if (!active) return null;

  const doneSets = active.entries.reduce(
    (sum, e) => sum + e.sets.filter((s) => s.completed).length,
    0
  );
  const totalSets = active.entries.reduce((sum, e) => sum + e.sets.length, 0);

  return (
    <div className="mb-5 flex items-center justify-between gap-4 rounded-card border border-accent/30 bg-accent/10 px-5 py-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-accent">
          Workout in progress
        </div>
        <div className="mt-0.5 text-sm font-medium text-ink">
          {active.workout_title} · {doneSets} of {totalSets} sets done
        </div>
      </div>
      <Link
        to={`/track/${active.workout_id}`}
        className="flex-none rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90"
      >
        Resume
      </Link>
    </div>
  );
}
