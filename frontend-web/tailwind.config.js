/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // gray-400 text was 2.5:1 on white; raised to 4.8:1 (WCAG 2.1 AA); other shades unchanged
        gray: { ...require('tailwindcss/colors').gray, 400: '#6B7280' },
        brand: {
          50:  '#EDFAF4',
          100: '#C6EFD9',
          200: '#9FE1C0',
          400: '#2EBB77',
          500: '#22A066',
          // 600/700 darkened for 4.5:1 text contrast on white (WCAG 2.1 AA)
          600: '#167A4C',
          700: '#105C38',
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
