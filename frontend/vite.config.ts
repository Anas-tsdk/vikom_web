import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxy = {
    '/api': {
      target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5084',
      changeOrigin: true
    }
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    server: {
      port: 5173,
      allowedHosts: ['vikom-demo.framenex.com'],
      proxy: apiProxy
    },
    preview: {
      allowedHosts: ['vikom-demo.framenex.com'],
      proxy: apiProxy
    }
  }
})
