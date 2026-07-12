export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-lg bg-panel2 px-2.5 py-1 text-xs font-semibold text-ink-secondary">
      {children}
    </span>
  );
}
