/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#dc2626',
          'red-dark': '#b91c1c',
          'red-soft': '#fee2e2',
          'red-bg': 'rgba(220, 38, 38, 0.06)',
        },
        surface: {
          DEFAULT: '#ffffff',
          alt: '#f8f8f9',
        },
      },
      fontFamily: {
        head: ['Tajawal', 'Segoe UI', 'sans-serif'],
        body: ['IBM Plex Sans Arabic', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
