import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  EquipmentIcon,
  ExercisesIcon,
  GymIcon,
  HistoryIcon,
  ScheduleIcon,
  WeekIcon,
  WorkoutsIcon,
} from '../icons';
import { useWorkouts } from '../../hooks/useWorkouts';

// Build is reached from the "New workout" button on Workouts, so it's not a nav item.
// Schedule sits directly under This Week (decision #21 pt.4); History moves directly
// under Schedule (decision #23). Equipment is a desktop-only item, like Exercises,
// to avoid crowding the phone tab bar — reachable by route on phone.
const DESKTOP_NAV = [
  { to: '/week', label: 'This Week', Icon: WeekIcon },
  { to: '/schedule', label: 'Schedule', Icon: ScheduleIcon },
  { to: '/history', label: 'History', Icon: HistoryIcon },
  { to: '/gyms', label: 'Gym', Icon: GymIcon },
  { to: '/workouts', label: 'Workouts', Icon: WorkoutsIcon },
  { to: '/exercises', label: 'Exercises', Icon: ExercisesIcon },
  { to: '/equipment', label: 'Equipment', Icon: EquipmentIcon },
];

// Phone reaches Exercises, Equipment & Build contextually — five tabs, History
// moved up directly under Schedule (decision #23).
const PHONE_TABS = [
  { to: '/week', label: 'This Week', Icon: WeekIcon },
  { to: '/schedule', label: 'Schedule', Icon: ScheduleIcon },
  { to: '/history', label: 'History', Icon: HistoryIcon },
  { to: '/gyms', label: 'Gym', Icon: GymIcon },
  { to: '/workouts', label: 'Workouts', Icon: WorkoutsIcon },
];

function navLinkClass(isActive: boolean): string {
  return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-panel2 text-ink font-semibold' : 'text-ink-secondary hover:bg-black/5'
  }`;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: workouts } = useWorkouts();

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-screen max-w-[1400px] bg-white md:my-0">
        {/* Desktop sidebar */}
        <aside className="hidden w-[238px] flex-none flex-col border-r border-black/[.06] bg-sidebar px-4 py-5 md:flex">
          <div className="flex items-center gap-2.5 px-2 pb-6">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round">
                <path d="M7 7v10M17 7v10M7 12h10" stroke="#F5EFE6" />
                <path d="M4 9v6M20 9v6" stroke="#B15834" />
              </svg>
            </div>
            <span className="text-[17px] font-bold text-ink">Reps</span>
          </div>
          <nav className="flex flex-col gap-0.5" aria-label="Main">
            {DESKTOP_NAV.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => navLinkClass(isActive)}>
                <Icon />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto flex items-center gap-2.5 border-t border-black/[.06] px-2 pb-0.5 pt-3">
            <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[#E7DFD2] text-sm font-bold text-[#8A7A5F]">
              A
            </div>
            <div>
              <div className="text-[13.5px] font-semibold text-ink">My Training</div>
              <div className="text-xs text-ink-faint">{workouts?.length ?? 0} workouts</div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-h-screen flex-1 overflow-x-hidden pb-20 md:pb-0">{children}</main>
      </div>

      {/* Phone bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-black/[.06] bg-sidebar px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden"
        aria-label="Main"
      >
        {PHONE_TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-3 py-1 text-[10.5px] font-semibold ${
                isActive ? 'text-ink' : 'text-status-restDot'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
