import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createGym, deleteGym, getGym, listGyms, updateGym } from '../api';
import type { GymInput } from '../types';

export function useGyms(params?: { q?: string; favorite?: boolean }) {
  return useQuery({
    queryKey: ['gyms', params ?? {}],
    queryFn: () => listGyms(params),
  });
}

export function useGym(id: string | undefined) {
  return useQuery({
    queryKey: ['gym', id],
    queryFn: () => getGym(id as string),
    enabled: !!id,
  });
}

function useInvalidateGyms() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['gyms'] });
  };
}

export function useCreateGym() {
  const invalidate = useInvalidateGyms();
  return useMutation({
    mutationFn: (body: GymInput) => createGym(body),
    onSuccess: invalidate,
  });
}

export function useUpdateGym() {
  const qc = useQueryClient();
  const invalidate = useInvalidateGyms();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<GymInput> }) => updateGym(id, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['gym', data.id] });
      invalidate();
    },
  });
}

export function useDeleteGym() {
  const invalidate = useInvalidateGyms();
  return useMutation({
    mutationFn: (id: string) => deleteGym(id),
    onSuccess: invalidate,
  });
}
