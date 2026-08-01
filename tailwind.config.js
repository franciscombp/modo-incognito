/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './index.html',
    './creador/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        cozy: {
          cream: '#F3E9D8',
          'cream-dark': '#E8D9C3',
          ink: '#4A3F33',
          'ink-soft': '#8B7355',
          brown: '#6B5D4F',
          tan: '#C4B5A0',
          terracotta: '#C85A54',
          'terracotta-light': '#E17460',
        },
        foreground: '#4A3F33',
        background: '#F3E9D8',
        primary: {
          DEFAULT: '#C85A54',
          foreground: '#F3E9D8',
        },
        secondary: {
          DEFAULT: '#8B7355',
          foreground: '#F3E9D8',
        },
        muted: {
          DEFAULT: '#D4C5B3',
          foreground: '#8B7355',
        },
        accent: {
          DEFAULT: '#C85A54',
          foreground: '#F3E9D8',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          '"Noto Sans"',
          'sans-serif',
        ],
        mono: ['Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      boxShadow: {
        cozy: '0 4px 12px rgba(74, 63, 51, 0.08)',
        'cozy-md': '0 8px 20px rgba(74, 63, 51, 0.12)',
        'cozy-lg': '0 12px 24px rgba(200, 90, 84, 0.15)',
      },
      borderRadius: {
        cozy: '6px',
      },
    },
  },
  plugins: [],
}
