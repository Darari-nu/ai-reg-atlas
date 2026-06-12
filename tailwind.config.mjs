/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md}'],
  // 動的クラス名（diff-${type}等）はパージで消えるため意味色をsafelistに固定登録（§15-7）
  safelist: [
    'bg-diff-stricter', 'bg-diff-looser', 'bg-diff-absent', 'bg-diff-unique',
    'text-diff-stricter', 'text-diff-looser', 'text-diff-absent', 'text-diff-unique',
    'border-diff-stricter', 'border-diff-looser', 'border-diff-absent', 'border-diff-unique',
    'bg-diff-stricter/10', 'bg-diff-looser/10', 'bg-diff-absent/10', 'bg-diff-unique/10',
    'bg-diff-stricter/15', 'bg-diff-looser/15', 'bg-diff-absent/15', 'bg-diff-unique/15',
  ],
  theme: {
    extend: {
      colors: {
        'navy-deep': '#0A1024',
        'navy-soft': '#141B36',
        'star-gold': '#FFC700',
        paper: '#FAFAF7',
        ink: '#1A2233',
        'diff-stricter': '#D64550',
        'diff-looser': '#2E9E6B',
        'diff-absent': '#8A94A6',
        'diff-unique': '#7C5CE0',
      },
      fontFamily: {
        display: ['"Shippori Mincho"', 'serif'],
        body: ['"Zen Kaku Gothic New"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
