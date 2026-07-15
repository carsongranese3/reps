import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { WeekPage } from './pages/WeekPage';
import { SchedulePage } from './pages/SchedulePage';
import { WorkoutsPage } from './pages/WorkoutsPage';
import { WorkoutDetailPage } from './pages/WorkoutDetailPage';
import { BuildPage } from './pages/BuildPage';
import { TrackPage } from './pages/TrackPage';
import { ExercisesPage } from './pages/ExercisesPage';
import { ExerciseDetailPage } from './pages/ExerciseDetailPage';
import { ExerciseFormPage } from './pages/ExerciseFormPage';
import { HistoryPage } from './pages/HistoryPage';
import { AddSessionPage } from './pages/AddSessionPage';
import { SessionDetailPage } from './pages/SessionDetailPage';
import { GymsPage } from './pages/GymsPage';
import { GymDetailPage } from './pages/GymDetailPage';
import { GymFormPage } from './pages/GymFormPage';
import { EquipmentPage } from './pages/EquipmentPage';
import { EquipmentFormPage } from './pages/EquipmentFormPage';

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/week" replace />} />
        <Route path="/week" element={<WeekPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/gyms" element={<GymsPage />} />
        <Route path="/gyms/new" element={<GymFormPage />} />
        <Route path="/gyms/:gymId" element={<GymDetailPage />} />
        <Route path="/gyms/:gymId/edit" element={<GymFormPage />} />
        <Route path="/workouts" element={<WorkoutsPage />} />
        <Route path="/workouts/:workoutId" element={<WorkoutDetailPage />} />
        <Route path="/build" element={<BuildPage />} />
        <Route path="/build/:workoutId" element={<BuildPage />} />
        <Route path="/track/:workoutId" element={<TrackPage />} />
        <Route path="/exercises" element={<ExercisesPage />} />
        <Route path="/exercises/new" element={<ExerciseFormPage />} />
        <Route path="/exercises/:exerciseId" element={<ExerciseDetailPage />} />
        <Route path="/exercises/:exerciseId/edit" element={<ExerciseFormPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/history/new" element={<AddSessionPage />} />
        <Route path="/history/:sessionId" element={<SessionDetailPage />} />
        <Route path="/equipment" element={<EquipmentPage />} />
        <Route path="/equipment/new" element={<EquipmentFormPage />} />
        <Route path="/equipment/:equipmentId/edit" element={<EquipmentFormPage />} />
        <Route path="*" element={<Navigate to="/week" replace />} />
      </Routes>
    </AppShell>
  );
}
