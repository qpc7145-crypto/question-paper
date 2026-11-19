import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0F172A",
        accent: { DEFAULT: "#1D4ED8", hover: "#1E40AF" },
        page: "#F8FAFC",
        line: "#E2E8F0",
        ink: "#0F172A",
        muted: "#475569",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
