/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#1a1d27',
        base: '#0f1117',
        border: '#2d3148',
        primary: '#6c7dff',
        muted: '#6b7280',
      },
    },
  },
  plugins: [],
}
