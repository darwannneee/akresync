/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 900: '#0B1F3A', 800: '#13315C', 700: '#1E4D8C', 100: '#DCE6F5', 50: '#EEF3FA' },
        surface: '#F5F7FB',
        accent: '#C9A227',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
};
