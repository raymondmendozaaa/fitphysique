/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: '15px',
    },
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    fontFamily: {
      roboto: ["Roboto", "sans-serif"], // ✅ Standard Tailwind font definition
      oswald: ["Oswald", "sans-serif"],
    },
    backgroundImage: {
      hero: 'url(/assets/img/hero/bg.png)',
      membership: 'url(/assets/img/membership/bg.jpg)',
    },
    extend: {
      colors: {
        primary: {
          DEFAULT: '#333',
          100: '#484848',
          200: '#151515',
          300: '#111',
        },
        accent: '#d4000d',
      }
    },
  },
  plugins: [],
};
