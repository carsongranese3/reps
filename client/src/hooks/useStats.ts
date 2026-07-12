import { useQuery } from '@tanstack/react-query';
import { getStats } from '../api';
import { todayLocalDate } from '../lib/date';

export function useStats() {
  const today = todayLocalDate();
  return useQuery({
    queryKey: ['stats', today],
    queryFn: () => getStats(today),
    staleTime: 30_000,
  });
}
