/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // gray-400 text was 2.5:1 on white; raised to 4.8:1 (WCAG 2.1 AA); other shades unchanged
        gray: { ...require('tailwindcss/colors').gray, 400: '#6B7280' },
        // DAWA BAG brand (owner decision 2026-10-02; colours sampled from the logo).
        // brand = teal. #0397A6 (500) is the logo teal: white on it is only 3.5:1, so it is
        // used for the logo, large text, borders and icons. Small text and buttons with
        // white text use 600+ (600 #027B87 = 5.0:1 with white, 4.8:1 on gray-50; 700 = 6.1:1).
        brand: {
          50:  '#EEF8FA',
          100: '#D3EEF2',
          200: '#A6DCE3',
          300: '#6CC3CE',
          400: '#2AAAB8',
          500: '#0397A6',
          600: '#027B87',
          700: '#026D78',
          800: '#025B64',
          900: '#01444B',
        },
        // Green accent (BAG + handle). #87A959 (500) is 2.7:1 on white: decoration and large
        // shapes only; green text uses 700 (#586F39, 5.6:1).
        accent: {
          50:  '#F4F8EE',
          100: '#E4EED6',
          200: '#C9DDAE',
          300: '#AFC888',
          400: '#9EB979',
          500: '#87A959',
          600: '#60793F',
          700: '#586F39',
          800: '#485B2F',
        },
        // Tagline grey (#565655, 7.4:1 on white)
        ink: { DEFAULT: '#565655' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
