import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./data/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        app: {
          background: "#FAFAF7",
          panel: "#FFFFFF",
          sidebar: "#F3F3EF",
          border: "#E5E5E0",
          text: "#0D0D0D",
          muted: "#74746F",
          green: "#183D2A",
          soft: "#E8F1E8",
          wash: "#EEF4EE",
          amber: "#F3E8C8",
          red: "#F4DDDD"
        }
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui"]
      },
      borderRadius: {
        app: "16px"
      }
    }
  },
  plugins: []
};

export default config;
