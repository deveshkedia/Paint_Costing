/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Warm paper background — not stark white, not beige-default.
        paper: "#FAF6F0",
        ink: "#1C1816",
        inkfaint: "#6B6258",
        // Deep teal-green — the "tin" color, used for nav/headers/primary surfaces.
        teal: "#0F3D3E",
        tealdark: "#0A2C2D",
        tealtint: "#E4EFEE",
        // Rust/terracotta — primary accent, literally a red-oxide primer swatch.
        rust: "#C75D3D",
        rustdark: "#A8492E",
        rusttint: "#FBEAE3",
        // Mustard/ochre — secondary accent for highlights, badges.
        ochre: "#D9A23B",
        ochretint: "#FBF1DC",
        // Status colors
        good: "#2E7D5B",
        goodtint: "#E6F3EC",
        bad: "#C0392B",
        badtint: "#FBEAE7",
      },
      fontFamily: {
        serif: ["Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
