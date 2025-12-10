import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/WebRTC_Client/' : '/',
  plugins: [tailwindcss(), react()],
  server: {
    host: '0.0.0.0', // 모든 네트워크 인터페이스에서 접속 허용
    port: 5173,
  },
  host: {
    allowedHosts: ['development-ward-webrtc.github.io']
  }
})
