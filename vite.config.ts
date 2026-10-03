import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base =
  process.env.GITHUB_ACTIONS === 'true' && repositoryName && !repositoryName.endsWith('.github.io')
    ? `/${repositoryName}/`
    : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three-core', test: /node_modules[\\/]three[\\/]/, priority: 40, maxSize: 400 * 1024 },
            { name: 'drei', test: /node_modules[\\/]@react-three[\\/]drei[\\/]/, priority: 39, maxSize: 350 * 1024 },
            { name: 'fiber', test: /node_modules[\\/]@react-three[\\/]fiber[\\/]/, priority: 38, maxSize: 350 * 1024 },
            { name: 'cannon', test: /node_modules[\\/]@react-three[\\/]cannon[\\/]/, priority: 37, maxSize: 350 * 1024 },
            { name: 'react-three', test: /node_modules[\\/]@react-three[\\/]/, priority: 30, maxSize: 350 * 1024 },
            { name: 'postprocessing', test: /node_modules[\\/]postprocessing[\\/]/, priority: 20, maxSize: 350 * 1024 },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
})
