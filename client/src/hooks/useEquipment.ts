import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createEquipment,
  deleteEquipment,
  getEquipment,
  listEquipment,
  updateEquipment,
} from '../api';
import type { EquipmentInput } from '../types';

export function useEquipmentList(q?: string) {
  return useQuery({
    queryKey: ['equipment', { q: q ?? '' }],
    queryFn: () => listEquipment(q),
  });
}

export function useEquipment(id: string | undefined) {
  return useQuery({
    queryKey: ['equipment-item', id],
    queryFn: () => getEquipment(id as string),
    enabled: !!id,
  });
}

function useInvalidateEquipment() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['equipment'] });
  };
}

export function useCreateEquipment() {
  const invalidate = useInvalidateEquipment();
  return useMutation({
    mutationFn: (body: EquipmentInput) => createEquipment(body),
    onSuccess: invalidate,
  });
}

export function useUpdateEquipment() {
  const qc = useQueryClient();
  const invalidate = useInvalidateEquipment();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<EquipmentInput> }) =>
      updateEquipment(id, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['equipment-item', data.id] });
      invalidate();
    },
  });
}

export function useDeleteEquipment() {
  const invalidate = useInvalidateEquipment();
  return useMutation({
    mutationFn: (id: string) => deleteEquipment(id),
    onSuccess: invalidate,
  });
}
