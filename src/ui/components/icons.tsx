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

const RESOURCE_PATHS: Record<string, string> = {
  budget:
    'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 2v1m0 6v1M6 9.5c0 .8.9 1 2 1s2-.3 2-1-1-.9-2-1-2-.3-2-1 .9-1 2-1 2 .2 2 1',
  material: 'M2 6l6-3 6 3v5l-6 3-6-3V6Zm0 0l6 3 6-3M8 9v5',
  fuel: 'M3 14V3h6v11M3 8h6m0-4l3 2v6a1 1 0 0 0 2 0V7l-2-2',
  ammo: 'M5 14V7l1.5-3h1L9 7v7H5Zm4 0V9h2l1 1v4H9Z',
  medicine: 'M6 2h4v4h4v4h-4v4H6v-4H2V6h4V2Z',
  food: 'M8 3c3 0 5 2 5 5s-2 5-5 5-5-2-5-5 2-5 5-5Zm0-1v2m-2 5c0 1 1 2 2 2',
  power: 'M9 1L3 9h4l-1 6 7-8H9l1-6Z',
  research: 'M6 2h4M7 2v4L3 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1L9 6V2',
};

/** Resource symbol, stroke only so it follows the text color. */
export function ResourceIcon({ id }: { id: string }) {
  return (
    <svg class="sz-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d={RESOURCE_PATHS[id] ?? ''}
        fill="none"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
  );
}

export function WarningIcon() {
  return (
    <svg class="sz-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d="M8 2l7 12H1L8 2Z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      <path d="M8 6.5v3.5M8 11.5v1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  );
}
