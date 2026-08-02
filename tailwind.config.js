/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        // ชุดสี CI ให้ตรงกับ CSS variables ใน styles.scss
        navy: { DEFAULT: "#404969", dark: "#333a54" },
        accent: { DEFAULT: "#5b89d8", dark: "#6b3d73" },
        skytint: "#bde4f4",
      },
    },
  },
  plugins: [],
};
