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

/** 24x24 line glyphs for build items and window buttons (stroke follows the text color). */
const GLYPHS: Record<string, string> = {
  // units
  infantry: 'M12 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM7 21v-6a5 5 0 0 1 10 0v6M17 13l4-5M9.5 21v-4h5v4',
  mgTeam: 'M3 10h12l2 2h4M8 10v3m0 0-4 8m4-8 3 8m-3-8 5 8M6 7h5',
  sniperTeam: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 1v6m0 10v6M1 12h6m10 0h6M12 11v2',
  mortar: 'M8 17 15 5l3 2-7 12M5 21h10M10 17l3 2',
  engineers: 'M14 4a4 4 0 0 0-4 5L3 16l3 3 7-7a4 4 0 0 0 5-4l-3 2-2-2 2-3Z',
  riotPolice: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3ZM12 7v10M8 11h8',
  medics: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM10 7h4v3h3v4h-3v3h-4v-3H7v-4h3V7Z',
  // structures
  barricade: 'M3 19 21 5M3 5l18 14M3 12h18',
  wall: 'M3 6h18v12H3V6Zm0 6h18M9 6v6m6 0v6M6 12v6m6-12v0',
  gate: 'M4 20V6m16 14V6M4 6h16M8 20v-9a4 4 0 0 1 8 0v9M12 11v9',
  wire: 'M3 17c3-8 4 8 7 0s4 8 7 0 3 4 4 0M5 8l2 2m3-3 2 2m3-3 2 2',
  mines: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M18 6l-2 2M8 16l-2 2',
  charge: 'M4 11h12v8H4v-8Zm12 3h3M19 14l2-3M8 11V8m0 0c0-2 3-1 3-3',
  watchtower: 'M7 21 9 11m8 10-2-10M6 11h12V7H6v4ZM9 7l3-4 3 4M9 16h6',
  depot: 'M3 9l9-5 9 5v11H3V9Zm5 11v-6h8v6M8 17h8',
  // civil tools
  corridor: 'M4 20c0-6 4-4 6-8s-2-6 4-8m0 0 4-1m-4 1 1 4M16 17l4 3m0 0v-3m0 3h-3',
  safeZone: 'M4 4h16v16H4V4Zm8 4v8M8 12h8',
  rallyPoint: 'M6 21V3m0 1h12l-3 4 3 4H6',
  // orders
  defendLine: 'M3 18 21 6M5 21v-4m5 1v-5m5 0v-5',
  holdZone: 'M4 4h16v16H4V4Zm4 4h8v8H8V8Z',
  occupyBuilding: 'M5 21V6l7-3 7 3v15H5Zm4-4h2v4H9v-4Zm4 0h2v4h-2v-4ZM9 8h2m2 0h2m-6 4h2m2 0h2',
  // windows
  economy: 'M4 20V10m6 10V4m6 16v-7m5 7H3M13 8l3-3 3 3',
  population:
    'M8 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM2 20v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3M17 5a3 3 0 0 1 0 6M18 14a4 4 0 0 1 4 4v2',
  decrees: 'M6 3h9l4 4v14H6V3Zm9 0v4h4M9 11h7M9 15h7',
};

export function Glyph({ id, size = 24 }: { id: string; size?: number }) {
  return (
    <svg
      class="sz-glyph"
      viewBox="0 0 24 24"
      width={`${size / 16}rem`}
      height={`${size / 16}rem`}
      aria-hidden="true"
    >
      <path
        d={GLYPHS[id] ?? ''}
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
  );
}
