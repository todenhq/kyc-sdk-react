import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic tokens (mapped via CSS vars in globals.css)
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },

        // Myaza brand — Primary (purple) shades
        myaza: {
          DEFAULT: "#5645F5",
          dark: "#1F156F",
          50: "#F6F5FE",    // PC-01
          100: "#E9E7FE",   // PC-02
          200: "#D3CFFC",   // PC-03
          300: "#BDB6FB",   // PC-04
          400: "#A6B8FA",   // PC-05
          500: "#9986F9",   // PC-06
          600: "#7B6EF7",   // PC-07
          700: "#6455F6",   // PC-08
          800: "#5B47F5",   // PC-09 (Main)
          900: "#3A25F4",   // PC-10
          950: "#2400F2",   // PC-11
        },

        // Accents
        accent1: "#8B65F5",
        accent2: "#4CD5F5",
        accent3: "#FEEBB4",
        accent4: "#43D5F5",

        // Text colors
        "text-dark": "#070330",   // TC-06 (Main)
        "text-light": "#F6F5FE",  // Text White-ish
      },
      fontFamily: {
        heading: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        body: ['"Geist"', "system-ui", "sans-serif"],
        sans: ['"Geist"', "system-ui", "sans-serif"],
      },
      keyframes: {
        "slide-up": {
          "0%": { transform: "translateY(16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "checkmark-draw": {
          "0%": { strokeDashoffset: "100" },
          "100%": { strokeDashoffset: "0" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "50%": { transform: "scale(1)", opacity: "0.3" },
          "100%": { transform: "scale(0.9)", opacity: "0.7" },
        },
        "card-flip": {
          "0%":   { transform: "rotateY(0deg)" },
          "50%":  { transform: "rotateY(90deg)" },
          "100%": { transform: "rotateY(0deg)" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
      },
      animation: {
        "slide-up": "slide-up 300ms ease-out",
        "fade-in": "fade-in 250ms ease-out",
        "checkmark": "checkmark-draw 500ms ease-out forwards",
        "pulse-ring": "pulse-ring 2s ease-in-out infinite",
        "card-flip": "card-flip 600ms ease-in-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
