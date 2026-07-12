import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createExercise,
  deleteExercise,
  getExercise,
  listExercises,
  updateExercise,
  uploadExerciseDemo,
} from '../api';
import type { Exercise, ExerciseInput } from '../types';

export function useExercises(params?: { q?: string; category?: string }) {
  return useQuery({
    queryKey: ['exercises', params ?? {}],
    queryFn: () => listExercises(params),
  });
}

/** Full library indexed by id — used to render exercise name/muscles inline on
 * workout/session/plan rows without an N+1 request per row. */
export function useExerciseMap() {
  const { data, ...rest } = useExercises();
  const map: Record<string, Exercise> = {};
  if (data) {
    for (const ex of data) map[ex.id] = ex;
  }
  return { map, exercises: data, ...rest };
}

export function useExercise(id: string | undefined) {
  return useQuery({
    queryKey: ['exercise', id],
    queryFn: () => getExercise(id as string),
    enabled: !!id,
  });
}

export function useCreateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ExerciseInput) => createExercise(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
  });
}

export function useUpdateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<ExerciseInput> }) =>
      updateExercise(id, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['exercise', data.id] });
      qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}

export function useDeleteExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExercise(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
  });
}

export function useUploadExerciseDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadExerciseDemo(id, file),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['exercise', data.id] });
      qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}
