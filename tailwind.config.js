/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./pages/**/*.html",
    "./pages/**/*.js",
    "./popup/**/*.html", 
    "./popup/**/*.js",
    "./content-scripts/**/*.js",
    "./components/**/*.js",
    "./safelist.html"
  ],
  theme: {
    screens: {
      'sm': '40rem',   // 640px
      'md': '48rem',   // 768px  
      'lg': '64rem',   // 1024px
      'xl': '80rem',   // 1280px
      '2xl': '96rem',  // 1536px
    },
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        }
      }
    },
  },
}