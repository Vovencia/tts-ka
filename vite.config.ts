import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig({
  base: './', // Assets will be linked relative to index.html
  build: {
    outDir: "docs",
  },
  plugins: [preact()],
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ['import', 'global-builtin', 'mixed-decls', 'color-functions', 'if-function'],
        // Игнорировать предупреждения в зависимостях (node_modules)
        quietDeps: true,
      },
    }
  }
})
