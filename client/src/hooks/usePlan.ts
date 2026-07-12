import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPlan, setPlanDay } from '../api';
import type { Weekday } from '../types';

export function usePlan() {
  return useQuery({
    queryKey: ['plan'],
    queryFn: () => getPlan(),
  });
}

export function useSetPlanDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ day, workoutId }: { day: Weekday; workoutId: string | null }) =>
      setPlanDay(day, workoutId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan'] });
      qc.invalidateQueries({ queryKey: ['week'] });
    },
  });
}
