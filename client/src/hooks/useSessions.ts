import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSession, deleteSession, getSession, listSessions, updateSession } from '../api';
import type { SessionInput, SessionUpdateInput } from '../types';

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

export function useUpdateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SessionUpdateInput }) => updateSession(id, body),
    onSuccess: (data) => {
      // Editing a session's sets recomputes totals/PRs, which changes History and
      // This Week (streak/N-of-M can shift if the workout link changed) too.
      qc.invalidateQueries({ queryKey: ['session', data.id] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['exercise'] });
      qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSession(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['week'] });
    },
  });
}
