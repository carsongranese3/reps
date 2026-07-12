export function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={`whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
        active ? 'bg-ink text-white' : 'bg-panel2 text-ink-secondary hover:bg-panel2/70'
      }`}
    >
      {label}
    </button>
  );
}
