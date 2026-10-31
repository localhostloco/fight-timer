// One small inline SVG glyph per sport. Drawn on a 24×24 grid with
// currentColor so they inherit the card's accent colour and need no assets.
import type { Sport } from '../engine/plan';

const PATHS: Record<Sport, preact.JSX.Element> = {
  // boxing glove
  boxing: (
    <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 11V7.5A3.5 3.5 0 0 1 10.5 4h4A4.5 4.5 0 0 1 19 8.5V13a4 4 0 0 1-4 4h-2.5" />
      <path d="M7 11a2.5 2.5 0 0 0 0 5h5.5" />
      <path d="M9.5 17v3h7v-3" />
      <path d="M11 8.5h4" />
    </g>
  ),
  // MMA: open-finger glove (fist with two finger loops)
  mma: (
    <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 12V9a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4a4 4 0 0 1-4 4H9a3 3 0 0 1-3-3v-2z" />
      <path d="M10 6V4M14 6V4" />
      <path d="M9 17v3h6v-3" />
      <path d="M6 12h12" />
    </g>
  ),
  // Muay Thai: mongkol headband silhouette over a head
  muaythai: (
    <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="13" r="5.5" />
      <path d="M5 9.5c2-3 5-4 7-4s5 1 7 4" />
      <path d="M17 7.5l3-2.5M19 9.5l2 .5" />
      <path d="M8.5 20.5h7" />
    </g>
  ),
  // Kickboxing: a kicking leg
  kickboxing: (
    <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="8" cy="5" r="2" />
      <path d="M8 8v5l-3 7" />
      <path d="M8 13l6-2 6 1" />
      <path d="M19 10l1.5 3" />
      <path d="M8 13l4 7" />
    </g>
  ),
  // BJJ: a belt knot
  bjj: (
    <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 10h6l3 2 3-2h6" />
      <path d="M3 14h6l3-2 3 2h6" />
      <path d="M9 10l-2 8M15 10l2 8" />
    </g>
  ),
  // Wrestling: two figures grappling (two arcs meeting)
  wrestling: (
    <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="6" cy="7" r="2" />
      <circle cx="18" cy="7" r="2" />
      <path d="M4 20l3-8 5 2 5-2 3 8" />
      <path d="M7 12l5 4 5-4" />
    </g>
  ),
  // HIIT: a lightning bolt
  hiit: (
    <path d="M13 2L5 13h6l-1 9 9-12h-6l1-8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
  ),
  // custom: a stopwatch
  custom: (
    <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="13.5" r="7" />
      <path d="M12 9.5v4l2.5 2" />
      <path d="M10 3h4M12 3v3.5M18 7l1.5-1.5" />
    </g>
  ),
};

export const SPORTS: Sport[] = ['boxing', 'mma', 'muaythai', 'kickboxing', 'bjj', 'wrestling', 'hiit', 'custom'];

export function SportIcon({ sport, size = 28 }: { sport?: Sport; size?: number }) {
  return (
    <svg class="sport-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      {PATHS[sport ?? 'custom']}
    </svg>
  );
}
