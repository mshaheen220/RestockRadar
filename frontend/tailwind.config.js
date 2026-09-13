/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fffbea',
          100: '#fdf3c7',
          200: '#fbe49b',
          300: '#f7d065',
          400: '#d9a62b',
          500: '#946c08',
          600: '#7a5806',
          700: '#5e4404',
          800: '#4a3603',
          900: '#3a2a02',
        },
      },
    },
  },
  plugins: [],
};
