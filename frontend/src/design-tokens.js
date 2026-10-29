export const designTokens = {
  colors: {
    bgBase: '#f9f5f0',
    bgSurface: '#ffffff',
    bgRaised: '#f3ece4',
    bgOverlay: '#eae0d4',
    border: 'rgba(74, 50, 34, 0.08)',
    borderStrong: 'rgba(74, 50, 34, 0.16)',
    text: '#2c1e14',
    textMuted: '#7c6858',
    textSoft: '#a18e80',
    gold500: '#b38059',
    gold400: '#c5936c',
    gold600: '#9e6d47',
    goldSoft: 'rgba(179, 128, 89, 0.12)',
    success: '#2d8a55',
    warning: '#c27d1a',
    danger: '#c93b3b',
    white: '#ffffff'
  },
  typography: {
    display: 'text-3xl font-semibold tracking-tight',
    h1: 'text-2xl font-semibold tracking-tight',
    h2: 'text-xl font-semibold tracking-tight',
    h3: 'text-base font-semibold',
    body: 'text-sm leading-6',
    compact: 'text-xs leading-5',
    metadata: 'text-[10px] font-semibold uppercase tracking-[0.18em]'
  },
  radius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '22px'
  },
  shadows: {
    soft: '0 8px 24px rgba(74, 50, 34, 0.06)',
    card: '0 2px 10px rgba(74, 50, 34, 0.04)',
    gold: '0 8px 20px rgba(179, 128, 89, 0.18)',
    inset: 'inset 0 1px 0 rgba(255, 255, 255, 0.6)'
  }
};

export const shellTokens = {
  navItem: 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-200',
  card: 'rounded-xl border border-[rgba(74,50,34,0.08)] bg-white shadow-[0_4px_16px_rgba(74,50,34,0.04)]',
  panel: 'rounded-xl border border-[rgba(74,50,34,0.08)] bg-[#fdfbf7]'
};
