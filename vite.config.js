import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 本地开发用 '/'，部署到 GitHub Pages 项目仓库时改为 '/仓库名/'
export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? './' : '/',
})
