import type { ReactNode } from 'react';

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-panel px-6 py-14 text-center">
      <span className="text-base font-semibold text-ink">{title}</span>
      {message && <span className="max-w-sm text-sm text-ink-muted">{message}</span>}
      {action}
    </div>
  );
}
