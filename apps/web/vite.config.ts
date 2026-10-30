import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (/node_modules\/(react|react-dom|scheduler|react-router)\//.test(id)) return 'react'
          if (id.includes('node_modules/@radix-ui') || id.includes('node_modules/radix-ui')) return 'radix'
        },
      },
    },
  },
})
