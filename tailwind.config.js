/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        archivo: ["ArchivoBlack-Regular"],
        mono: ["JetBrainsMono-Regular"],
        "mono-bold": ["JetBrainsMono-Bold"],
      },
    },
  },
  plugins: [],
};
