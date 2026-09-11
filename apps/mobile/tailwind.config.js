/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../web/src/**/*.{js,ts,jsx,tsx}",
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
        editorial: ['Georgia', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
}
