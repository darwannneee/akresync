/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#0A1A33', 900: '#0B1F3A', 800: '#13315C', 700: '#1E4D8C', 600: '#2A5FA5', 200: '#C5D4EA', 100: '#DCE6F5', 50: '#EEF3FA' },
        surface: '#F6F8FB',
        line: '#E3E8EF',
        ink: '#0F172A',
        muted: '#475569',
        faint: '#64748B',
        accent: '#C9A227',
        ok: { DEFAULT: '#15803D', bg: '#ECFDF3', line: '#BBE5CB' },
        wait: { DEFAULT: '#B45309', bg: '#FFFBEB', line: '#F3DDA8' },
        info: { DEFAULT: '#1D4ED8', bg: '#EFF6FF', line: '#BFD3F7' },
        bad: { DEFAULT: '#B91C1C', bg: '#FEF2F2', line: '#F3C0C0' },
        chain: { DEFAULT: '#4338CA', bg: '#EEF2FF', line: '#C9CEF5' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.25rem' }],
        sm: ['0.9375rem', { lineHeight: '1.5rem' }],
        base: ['1rem', { lineHeight: '1.6rem' }],
      },
      boxShadow: { card: '0 1px 2px rgba(15,23,42,.05), 0 1px 3px rgba(15,23,42,.04)' },
    },
  },
  plugins: [],
};
