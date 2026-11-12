/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#0A1A33', 900: '#0B1F3A', 800: '#13315C', 700: '#1E4D8C', 600: '#2A5FA5', 200: '#C5D4EA', 100: '#DCE6F5', 50: '#EEF3FA' },
        surface: '#F1F3F8',
        line: '#DEE2E8',
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
        sans: ['Roboto', 'system-ui', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['Roboto', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.875rem', { lineHeight: '1.375rem' }],
        base: ['0.9375rem', { lineHeight: '1.5rem' }],
        lg: ['1.0625rem', { lineHeight: '1.5rem' }],
        xl: ['1.125rem', { lineHeight: '1.6rem' }],
        '2xl': ['1.375rem', { lineHeight: '1.75rem' }],
        '3xl': ['1.75rem', { lineHeight: '2.1rem' }],
      },
      borderRadius: { md: '4px', lg: '4px', xl: '6px', '2xl': '6px' },
      boxShadow: { card: '0 1px 2px rgba(15,23,42,.04)', header: '0 1px 3px rgba(15,23,42,.08)' },
    },
  },
  plugins: [],
};
