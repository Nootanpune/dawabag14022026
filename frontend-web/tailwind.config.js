/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#EDFAF4',
          100: '#C6EFD9',
          200: '#9FE1C0',
          400: '#2EBB77',
          500: '#22A066',
          600: '#1A8856',
          700: '#126840',
          800: '#0F5235',
          900: '#083522',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
