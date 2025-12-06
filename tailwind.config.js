/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx,mdx}",
    "./components/**/*.{js,jsx,ts,tsx,mdx}",
    "./context/**/*.{js,jsx,ts,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brandLight: "#7dd3fc", // jasny niebieski
        brandDark: "#0f172a",  // ciemny granat / navy
        brandAccent: "#38bdf8" // neonowy niebiesko-turkusowy
      },
      boxShadow: {
        neon: "0 0 25px rgba(56, 189, 248, 0.6)"
      }
    }
  },
  plugins: [require("@tailwindcss/forms")]
};
