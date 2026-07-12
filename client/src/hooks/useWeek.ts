import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getWeek } from '../api';
import { todayLocalDate } from '../lib/date';

export const weekKey = (today: string) => ['week', today] as const;

export function useWeek() {
  const today = todayLocalDate();
  return useQuery({
    queryKey: weekKey(today),
    queryFn: () => getWeek(today),
    staleTime: 30_000,
  });
}

/** Call after a session completes or the plan changes so This Week updates without a reload. */
export function useInvalidateWeek() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['week'] });
}
