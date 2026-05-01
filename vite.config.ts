import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ['import', 'global-builtin', 'mixed-decls', 'color-functions', 'if-function'],
        quietDeps: true // Игнорировать предупреждения в зависимостях (node_modules)
      },
    }
  }
})
