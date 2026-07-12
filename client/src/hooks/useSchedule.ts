import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSchedule, setScheduleDay } from '../api';
import { todayLocalDate } from '../lib/date';
import type { ScheduleDayBody } from '../types';

/** Reads the resolved schedule for a date range (typically a padded month). Always
 * passes the device's local "today" so the `status` overlay lines up with This Week
 * (decision #12). */
export function useSchedule(from: string, to: string) {
  const today = todayLocalDate();
  return useQuery({
    queryKey: ['schedule', from, to, today],
    queryFn: () => getSchedule(from, to, today),
    staleTime: 30_000,
  });
}

/** Mutates a single date's schedule (add/remove-all/rest/clear). Schedule drives This
 * Week/streak/N-of-M, so a successful mutation invalidates all three. */
export function useSetScheduleDay() {
  const qc = useQueryClient();
  const today = todayLocalDate();
  return useMutation({
    mutationFn: ({ date, body }: { date: string; body: ScheduleDayBody }) =>
      setScheduleDay(date, body, today),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
