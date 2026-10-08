import type { Config } from "tailwindcss";

// Ascend design tokens, taken from the design export in ../design.
// Colours and shadows here are the only place these values should live;
// components reference them by name (e.g. bg-teal, shadow-card).
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        teal: { DEFAULT: "#0F5C4D", dark: "#0B4A3E", glow: "#9BE0C9", soft: "#2E8B74" },
        mint: { DEFAULT: "#E7F3EF", line: "#D3E8E0" },
        paper: "#FAFAF7",
        ink: "#141A22",
        muted: "#5B6574",
        amber: { DEFAULT: "#C2410C", soft: "#FDF0E8", line: "#F3CDB5", deep: "#9A3412" },
        line: "#E3E6E1",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "20px",
        hero: "24px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,26,34,0.04), 0 10px 28px -18px rgba(20,26,34,0.18)",
        hero: "0 22px 40px -22px rgba(15,92,77,0.75), 0 2px 6px rgba(15,92,77,0.18), inset 0 1px 0 rgba(255,255,255,0.14)",
        button: "inset 0 1px 0 rgba(255,255,255,0.16), 0 10px 22px -10px rgba(15,92,77,0.6)",
      },
      keyframes: {
        ascIn: { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "none" } },
        ascPop: {
          "0%": { transform: "scale(.5)", opacity: "0" },
          "60%": { transform: "scale(1.1)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        ascFall: {
          "0%": { transform: "translateY(-30px) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translateY(880px) rotate(560deg)", opacity: "0" },
        },
        ascSheet: { from: { transform: "translateY(100%)" }, to: { transform: "none" } },
        ascGrow: { from: { transform: "scaleX(0)" }, to: { transform: "scaleX(1)" } },
        ascStory: { from: { width: "0%" }, to: { width: "100%" } },
      },
      animation: {
        "asc-in": "ascIn .3s ease both",
        "asc-pop": "ascPop .45s ease both",
        "asc-fall": "ascFall 1.6s ease-in forwards",
        "asc-sheet": "ascSheet .28s ease both",
        "asc-grow": "ascGrow .6s ease both",
        "asc-story": "ascStory 6s linear forwards",
      },
    },
  },
  plugins: [],
};
export default config;
