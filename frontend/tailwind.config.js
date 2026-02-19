/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
                mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
            },
            colors: {
                surface: {
                    primary: '#0a0e1a',
                    secondary: '#111827',
                    card: 'rgba(17, 24, 39, 0.7)',
                    glass: 'rgba(255, 255, 255, 0.04)',
                },
                accent: {
                    blue: '#3b82f6',
                    cyan: '#06b6d4',
                    emerald: '#10b981',
                    amber: '#f59e0b',
                    rose: '#f43f5e',
                    violet: '#8b5cf6',
                },
            },
            animation: {
                'pulse-dot': 'pulseDot 2s infinite',
                'alert-pulse': 'alertPulse 2s infinite',
                'badge-flash': 'badgeFlash 1.5s infinite',
                'float': 'float 20s infinite ease-in-out',
                'slide-in': 'slideIn 0.3s ease-out',
                'shimmer': 'shimmer 1.5s infinite',
            },
            keyframes: {
                pulseDot: {
                    '0%, 100%': { opacity: '1', transform: 'scale(1)' },
                    '50%': { opacity: '0.5', transform: 'scale(0.8)' },
                },
                alertPulse: {
                    '0%, 100%': { boxShadow: '0 4px 24px rgba(0,0,0,0.3), 0 0 20px rgba(244,63,94,0.1)' },
                    '50%': { boxShadow: '0 4px 24px rgba(0,0,0,0.3), 0 0 40px rgba(244,63,94,0.25)' },
                },
                badgeFlash: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.6' },
                },
                float: {
                    '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
                    '33%': { transform: 'translate(30px, -30px) scale(1.05)' },
                    '66%': { transform: 'translate(-20px, 20px) scale(0.95)' },
                },
                slideIn: {
                    from: { opacity: '0', transform: 'translateY(-10px)' },
                    to: { opacity: '1', transform: 'translateY(0)' },
                },
                shimmer: {
                    '0%': { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
            },
        },
    },
    plugins: [],
}
