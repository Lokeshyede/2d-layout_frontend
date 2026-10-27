/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        retailfix: {
          red: {
            50: '#fef2f2',
            100: '#fee2e2',
            200: '#fecaca',
            300: '#fca5a5',
            400: '#f87171',
            500: '#ef4444',
            600: '#dc2626',
            700: '#b91c1c',
            800: '#991b1b',
            900: '#7f1d1d',
          },
          dark: {
            950: '#06080e',
            900: '#0b0f19',
            800: '#111827',
            700: '#1f2937',
            600: '#374151',
          },
          cad: {
            bg: '#ffffff',
            grid: '#e5e7eb',
            majorGrid: '#cbd5e1',
            axis: '#94a3b8',
            wall: '#1e293b',
            column: '#0f172a',
            door: '#dc2626',
            window: '#0284c7',
            rack: '#2563eb',
            dim: '#b91c1c',
            select: '#3b82f6',
            snap: '#10b981'
          }
        }
      },
      fontFamily: {
        sans: ['Inter', 'Outfit', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      }
    },
  },
  plugins: [],
}
