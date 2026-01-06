import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      animation: {
        'pulse-delay-75': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) 0.075s infinite',
        'pulse-delay-150': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) 0.15s infinite',
      },
    },
  },
};

export default config;
