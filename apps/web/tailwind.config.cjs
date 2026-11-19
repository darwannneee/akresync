/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#0B1B33', 900: '#10264A', 800: '#163566', 700: '#1D4B8F', 600: '#2B5FA8', 200: '#C7D5EB', 100: '#E1E9F5', 50: '#F2F6FB' },
        surface: '#F6F7F9',
        line: '#E8EAEE',
        ink: '#111827',
        muted: '#4B5563',
        faint: '#6B7280',
        gold: '#C9A227',
        ok: { DEFAULT: '#15803D', bg: '#ECFDF3', line: '#BBE5CB' },
        wait: { DEFAULT: '#B45309', bg: '#FFFBEB', line: '#F3DDA8' },
        info: { DEFAULT: '#1D4ED8', bg: '#EFF6FF', line: '#BFD3F7' },
        bad: { DEFAULT: '#B91C1C', bg: '#FEF2F2', line: '#F3C0C0' },
        chain: { DEFAULT: '#4338CA', bg: '#EEF2FF', line: '#C9CEF5' },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', 'system-ui', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.25rem' }],
        sm: ['0.875rem', { lineHeight: '1.375rem' }],
        base: ['0.9375rem', { lineHeight: '1.5rem' }],
        lg: ['1.0625rem', { lineHeight: '1.5rem' }],
        xl: ['1.125rem', { lineHeight: '1.6rem' }],
        '2xl': ['1.375rem', { lineHeight: '1.75rem' }],
        '3xl': ['1.75rem', { lineHeight: '2.1rem' }],
        '4xl': ['2rem', { lineHeight: '2.25rem' }],
      },
      boxShadow: { card: 'none', header: '0 1px 0 rgba(15,23,42,.04)', pop: '0 10px 30px -8px rgba(15,23,42,.18), 0 2px 6px rgba(15,23,42,.06)' },
    },
  },
  plugins: [],
};
