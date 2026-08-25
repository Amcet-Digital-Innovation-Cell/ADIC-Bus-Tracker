import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8000,
    strictPort: true, // Fail if 8000 is taken (don't silently pick another port)
  },
})
