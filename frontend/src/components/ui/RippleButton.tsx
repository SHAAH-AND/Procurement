import { useState } from 'react';

type Ripple = { id: number; x: number; y: number; size: number };

interface RippleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline';
}

/**
 * Enterprise brand button — liquid hover sheen + click-origin ink ripple.
 * Hover-only liquid (cursor-tracked brand glow, eases in, never loops);
 * single-fire ripple per click. Auth pages only.
 * Replaces animate-ui LiquidButton + RippleButton without the extra tree.
 */
export function RippleButton({ variant = 'primary', className = '', children, onClick, onMouseMove, ...rest }: RippleButtonProps) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [liquid, setLiquid] = useState<{ x: number; y: number } | null>(null);

  const handleMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setLiquid({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    (onMouseMove as any)?.(e);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const id = Date.now() + Math.random();
    const ripple = { id, x: e.clientX - rect.left - size / 2, y: e.clientY - rect.top - size / 2, size };
    setRipples((r) => [...r, ripple]);
    setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 650);
    onClick?.(e);
  };

  const styles =
    variant === 'primary'
      ? 'bg-gradient-to-r from-[#2084FA] to-[#7F3EDD] text-white shadow-md shadow-blue-500/25 hover:brightness-110'
      : 'bg-white border-2 border-[#D9E3F7] hover:border-[#2084FA] text-[#07175A]';

  return (
    <button
      {...rest}
      onClick={handleClick}
      onMouseMove={handleMove}
      onMouseLeave={() => setLiquid(null)}
      className={`relative overflow-hidden w-full py-3 px-6 font-semibold text-sm rounded-xl transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-60 ${styles} ${className}`}
    >
      {/* liquid hover sheen — follows the cursor, fades in/out */}
      <span
        aria-hidden="true"
        className="absolute w-40 h-40 rounded-full pointer-events-none transition-opacity duration-300"
        style={{
          left: (liquid?.x ?? -100) - 80,
          top: (liquid?.y ?? -100) - 80,
          opacity: liquid ? 1 : 0,
          background: variant === 'primary'
            ? 'radial-gradient(circle, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 65%)'
            : 'radial-gradient(circle, rgba(32,132,250,0.18) 0%, rgba(32,132,250,0) 65%)',
        }}
      />
      <span className="relative z-10 flex items-center gap-2">{children}</span>
      {ripples.map((r) => (
        <span
          key={r.id}
          className="ripple-ink absolute rounded-full pointer-events-none"
          style={{
            left: r.x,
            top: r.y,
            width: r.size,
            height: r.size,
            background: variant === 'primary' ? 'rgba(255,255,255,0.45)' : 'rgba(32,132,250,0.25)',
          }}
        />
      ))}
      <style>{`
        .ripple-ink { transform: scale(0); opacity: 1; animation: ripple-spread 0.6s ease-out forwards; }
        @keyframes ripple-spread { to { transform: scale(1); opacity: 0; } }
      `}</style>
    </button>
  );
}
