/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: "#851F32",
        secondary: "#182D3B",
        accent: "#F8F5EF",
      },
      fontFamily: {
        sans: ['Montserrat', 'Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        editorial: ['Montserrat', 'Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '600',
        extrabold: '700',
        black: '700',
      },
    },
  },
  plugins: [],
}
