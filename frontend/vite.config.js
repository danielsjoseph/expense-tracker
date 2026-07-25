import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // The dev server (port 5173) proxies API/auth calls straight to
      // Django (port 8000) so the browser sees everything as same-origin
      // during development, same as production (single service, no CORS).
      '/api': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
      '/export': 'http://localhost:8000',
      '/logout': 'http://localhost:8000',
    },
  },
})
