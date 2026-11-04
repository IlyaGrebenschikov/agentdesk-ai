import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Docker dev-container must listen on all interfaces to be reachable from the host
  server: { host: true }
})
