export function ErrorState({
  message = 'Something went wrong.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-card border border-status-missedRing bg-status-missedBg px-6 py-10 text-center"
      role="alert"
    >
      <span className="text-sm font-semibold text-status-missed">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90"
        >
          Try again
        </button>
      )}
    </div>
  );
}
