const ICON_SRC: Record<string, string> = {
  home: '/app/img/icon-home.png',
  requests: '/app/img/icon-requests.png',
  approvals: '/app/img/icon-approvals.png',
  items: '/app/img/icon-items.png',
  vendors: '/app/img/icon-vendors.png',
  procurement: '/app/img/icon-procurement.png',
  payables: '/app/img/icon-payables.png',
  budgets: '/app/img/icon-budgets.png',
  analytics: '/app/img/icon-analytics.png',
};

interface NavIconProps {
  name: string;
  size?: number;
  active?: boolean;
}

export function NavIcon({ name, size = 16, active = false }: NavIconProps) {
  const src = ICON_SRC[name];
  if (src) {
    return <img src={src} alt={name} width={size} height={size} className={`flex-shrink-0 object-contain ${active ? 'brightness-0 invert' : 'opacity-[0.82]'}`} style={{ width: size, height: size, filter: active ? 'brightness(0) invert(1) drop-shadow(0 0.5px 0 rgba(15,23,42,0.08))' : 'drop-shadow(0 0.5px 0 rgba(15,23,42,0.04))' }} />;
  }
  const color = active ? 'white' : '#64748b';
  const icons: Record<string, React.ReactNode> = {
    home: <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
      {icons[name] || icons.home}
    </svg>
  );
}