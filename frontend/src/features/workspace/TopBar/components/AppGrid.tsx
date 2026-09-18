export function AppGrid() {
  return (
    <button className="hidden lg:flex w-8 h-8 rounded-lg hover:bg-white/10 items-center justify-center text-white/70 hover:text-white transition-colors ml-3">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="5" r="2" fill="currentColor" /><circle cx="12" cy="5" r="2" fill="currentColor" /><circle cx="19" cy="5" r="2" fill="currentColor" /><circle cx="5" cy="12" r="2" fill="currentColor" /><circle cx="12" cy="12" r="2" fill="currentColor" /><circle cx="19" cy="12" r="2" fill="currentColor" /><circle cx="5" cy="19" r="2" fill="currentColor" /><circle cx="12" cy="19" r="2" fill="currentColor" /><circle cx="19" cy="19" r="2" fill="currentColor" /></svg>
    </button>
  );
}