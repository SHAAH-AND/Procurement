import { useId } from 'react';

// ProcureFlow "P" mark — bottom-up gradient fill driven by progress (0-100).
// Base layer is a pale outline; the gradient layer is clipped by a rect
// that rises as progress increases. IDs are unique per instance.
const P_PATH =
  'M 175,370 C 150,370 140,350 145,325 L 165,225 C 168,210 178,200 193,200 L 265,200 C 280,200 290,210 290,225 C 290,240 280,250 265,250 L 195,250 L 185,300 C 182,315 190,320 205,320 L 215,320 C 230,320 238,310 242,295 L 250,255 L 295,255 L 285,295 C 275,340 250,370 205,370 Z M 215,175 C 200,175 190,165 193,150 C 195,135 208,125 223,125 L 310,125 C 365,125 410,165 410,225 C 410,290 355,335 295,335 C 280,335 270,325 273,310 C 276,295 288,285 303,285 C 340,285 360,260 360,225 C 360,190 330,175 295,175 Z M 110,185 A 12,12 0 1,1 110,161 A 12,12 0 1,1 110,185 Z M 125,245 A 15,15 0 1,1 125,215 A 15,15 0 1,1 125,245 Z M 118,315 A 10,10 0 1,1 118,295 A 10,10 0 1,1 118,315 Z';

export function ProcureFlowLoader({ progress = 0, size = 120 }: { progress?: number; size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradId = `pfl-grad-${uid}`;
  const clipId = `pfl-clip-${uid}`;
  const p = Math.min(100, Math.max(0, progress));
  const fillH = (500 * p) / 100;

  return (
    <div style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 500 500" width="100%" height="100%">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0052FF" />
            <stop offset="50%" stopColor="#00A3FF" />
            <stop offset="100%" stopColor="#7000FF" />
          </linearGradient>
          <clipPath id={clipId}>
            <rect
              x="0"
              y={500 - fillH}
              width="500"
              height={Math.max(fillH, 0.01)}
              style={{ transition: 'y 0.35s ease-out, height 0.35s ease-out' }}
            />
          </clipPath>
        </defs>
        <path d={P_PATH} fill="none" stroke="#E2E8F0" strokeWidth="6" strokeLinejoin="round" />
        <g clipPath={`url(#${clipId})`}>
          <path d={P_PATH} fill={`url(#${gradId})`} />
        </g>
      </svg>
    </div>
  );
}

export default ProcureFlowLoader;
