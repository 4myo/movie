import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

// https://vite.dev/config/
export default defineConfig({
  // Electron loads the built app via file:// which needs relative asset paths
  base: process.env.ELECTRON_BUILD ? './' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  server: {
    historyApiFallback: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  },
  plugins: [react(), tailwindcss()],
})
