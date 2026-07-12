import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkout,
  deleteWorkout,
  getWorkout,
  listWorkouts,
  updateWorkout,
} from '../api';
import type { WorkoutInput } from '../types';

export function useWorkouts(params?: { q?: string; category?: string; favorite?: boolean }) {
  return useQuery({
    queryKey: ['workouts', params ?? {}],
    queryFn: () => listWorkouts(params),
  });
}

export function useWorkout(id: string | undefined) {
  return useQuery({
    queryKey: ['workout', id],
    queryFn: () => getWorkout(id as string),
    enabled: !!id,
  });
}

function useInvalidateWorkouts() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['workouts'] });
    qc.invalidateQueries({ queryKey: ['week'] });
    qc.invalidateQueries({ queryKey: ['plan'] });
  };
}

export function useCreateWorkout() {
  const invalidate = useInvalidateWorkouts();
  return useMutation({
    mutationFn: (body: WorkoutInput) => createWorkout(body),
    onSuccess: invalidate,
  });
}

export function useUpdateWorkout() {
  const qc = useQueryClient();
  const invalidate = useInvalidateWorkouts();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<WorkoutInput> }) =>
      updateWorkout(id, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['workout', data.id] });
      invalidate();
    },
  });
}

export function useDeleteWorkout() {
  const invalidate = useInvalidateWorkouts();
  return useMutation({
    mutationFn: (id: string) => deleteWorkout(id),
    onSuccess: invalidate,
  });
}
