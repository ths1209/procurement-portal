/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'sans-serif'],
      },
      colors: {
        // 语义化颜色 token（通过 CSS 变量实现 dark/light 自动切换）
        surface:  'var(--surface)',
        surface2: 'var(--surface2)',
        border:   'var(--border)',
        muted:    'var(--muted)',
        primary:  { DEFAULT: '#6366F1', dark: '#818CF8' },
        accent:   '#0EA5E9',
      },
      animation: {
        'page-in':    'pageIn 0.38s cubic-bezier(0.22,1,0.36,1) both',
        'fade-up':    'fadeUp 0.3s cubic-bezier(0.22,1,0.36,1) both',
        'scale-in':   'scaleIn 0.24s cubic-bezier(0.34,1.56,0.64,1) both',
        'fade-in':    'fadeIn 0.22s ease-out both',
        'slide-down': 'slideDown 0.26s cubic-bezier(0.22,1,0.36,1) both',
        'spring-in':  'springIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
      },
      keyframes: {
        pageIn:    { from:{ opacity:'0', transform:'translateY(22px)' }, to:{ opacity:'1', transform:'translateY(0)' } },
        fadeUp:    { from:{ opacity:'0', transform:'translateY(12px)' }, to:{ opacity:'1', transform:'translateY(0)' } },
        scaleIn:   { from:{ opacity:'0', transform:'scale(0.94)' },     to:{ opacity:'1', transform:'scale(1)' } },
        fadeIn:    { from:{ opacity:'0' },                              to:{ opacity:'1' } },
        slideDown: { from:{ opacity:'0', transform:'translateY(-10px)' },to:{ opacity:'1', transform:'translateY(0)' } },
        springIn:  { from:{ opacity:'0', transform:'scale(0.9) translateY(16px)' }, to:{ opacity:'1', transform:'scale(1) translateY(0)' } },
      },
    },
  },
  plugins: [],
}
