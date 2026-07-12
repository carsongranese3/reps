import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSession, getSession, listSessions } from '../api';
import type { SessionInput } from '../types';

export function useSessions(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['sessions', params ?? {}],
    queryFn: () => listSessions(params),
  });
}

export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: ['session', id],
    queryFn: () => getSession(id as string),
    enabled: !!id,
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SessionInput) => createSession(body),
    onSuccess: () => {
      // Finishing a session updates This Week (Done dot/N-of-M/streak) and History
      // without a reload.
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['exercise'] });
      qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}
