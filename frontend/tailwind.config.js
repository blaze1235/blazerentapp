/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#090E1A',
        surface: '#0d1220',
        card: '#111827',
        'blue-brand': '#2563eb',
        'blue-l': '#3b82f6',
        'blue-xl': '#60a5fa',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
