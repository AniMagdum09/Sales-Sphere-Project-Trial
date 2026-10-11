import react from '@vitejs/plugin-react'

// base: './' makes the built index.html reference assets relatively,
// so Electron can load dist/index.html directly from file://.
export default {
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
}
