// Muscle anatomy visual: the bundled realistic front + back muscle diagram with
// the worked muscles highlighted on top (heat by intensity). Image + tint live
// in one <svg> so the overlay is always aligned to the figure at any size.
// Bundled locally, no external calls.
import type { Region } from '../lib/muscles';
import anatomyImg from '../assets/muscle-anatomy.png';

const IMG_W = 574;
const IMG_H = 620;

// Ellipse blobs [cx, cy, rx, ry] positioned over each muscle in the image
// (front figure = left, back figure = right). Verified against the asset.
const REGION_BLOBS: Record<Region, [number, number, number, number][]> = {
  chest: [[120, 165, 48, 26]],
  front_delts: [[60, 132, 21, 18], [180, 132, 21, 18]],
  biceps: [[48, 205, 16, 26], [192, 205, 16, 26]],
  forearms: [[30, 285, 15, 30], [210, 285, 15, 30]],
  abs: [[120, 225, 26, 42]],
  obliques: [[88, 235, 12, 30], [152, 235, 12, 30]],
  quads: [[95, 370, 22, 55], [147, 370, 22, 55]],
  adductors: [[120, 350, 14, 40]],
  traps: [[456, 140, 40, 32]],
  rear_delts: [[387, 142, 22, 18], [525, 142, 22, 18]],
  upper_back: [[456, 200, 38, 26]],
  lats: [[409, 222, 22, 34], [503, 222, 22, 34]],
  triceps: [[367, 228, 16, 32], [545, 228, 16, 32]],
  lower_back: [[456, 272, 22, 26]],
  glutes: [[431, 315, 26, 24], [483, 315, 26, 24]],
  hamstrings: [[429, 398, 22, 52], [485, 398, 22, 52]],
  calves: [[96, 482, 16, 40], [146, 482, 16, 40], [425, 498, 18, 42], [489, 498, 18, 42]],
};

export interface MuscleMapProps {
  intensities?: Partial<Record<Region, number>>;
  /** Retained for call-site compatibility; the image always shows both views. */
  view?: 'front' | 'back' | 'both';
  className?: string;
  figureClassName?: string;
}

export function MuscleMap({ intensities = {}, className = '' }: MuscleMapProps) {
  return (
    <svg
      viewBox={`0 0 ${IMG_W} ${IMG_H}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
      aria-label="Muscles worked, highlighted on a body diagram"
    >
      <defs>
        {/* Soft glow so the tint reads as a heat blob, not a hard patch. */}
        <filter id="mm-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <image href={anatomyImg} x={0} y={0} width={IMG_W} height={IMG_H} />
      <g style={{ mixBlendMode: 'multiply' }} filter="url(#mm-soft)">
        {(Object.entries(REGION_BLOBS) as [Region, [number, number, number, number][]][]).flatMap(
          ([region, blobs]) => {
            const v = intensities[region] ?? 0;
            if (v <= 0) return [];
            const opacity = 0.28 + Math.min(1, v) * 0.5;
            return blobs.map(([cx, cy, rx, ry], i) => (
              <ellipse
                key={`${region}-${i}`}
                cx={cx}
                cy={cy}
                rx={rx}
                ry={ry}
                fill="#B15834"
                fillOpacity={opacity}
              />
            ));
          }
        )}
      </g>
    </svg>
  );
}
