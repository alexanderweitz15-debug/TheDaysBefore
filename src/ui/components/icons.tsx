// Inline SVG icons drawn in code (no external assets).
export function LockIcon({ title }: { title?: string }) {
  return (
    <svg
      class="sz-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      <rect x="3" y="7" width="10" height="7" rx="1" fill="currentColor" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.5" />
    </svg>
  );
}
