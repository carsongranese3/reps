/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Pantry theme — docs/design.md
        canvas: '#E7E4DE',
        surface: '#FFFFFF',
        sidebar: '#FBF9F4',
        panel: '#F7F4EE',
        panel2: '#F4F1EB',
        ink: {
          DEFAULT: '#1A1815',
          secondary: '#6E6A62',
          muted: '#948E82',
          faint: '#A39C90',
        },
        accent: {
          DEFAULT: '#B15834',
          hover: '#96482a',
        },
        status: {
          done: '#567a3e',
          doneBg: '#EBF0E3',
          missed: '#C0654B',
          missedBg: '#FBECE6',
          missedRing: '#E3B7A8',
          rest: '#ECEAE4',
          restDot: '#B4AC9E',
          plannedRing: '#CFC6B6',
        },
        category: {
          strength: '#95482a',
          push: '#5f5170',
          pull: '#b0803f',
          legs: '#567a3e',
          cardio: '#b64436',
          mobility: '#a89a76',
          misc: '#8c6330',
        },
        hairline: 'rgba(0,0,0,.07)',
      },
      borderRadius: {
        card: '13px',
        window: '15px',
      },
      boxShadow: {
        win: '0 34px 70px -24px rgba(38,30,22,.42)',
      },
    },
  },
  plugins: [],
};
