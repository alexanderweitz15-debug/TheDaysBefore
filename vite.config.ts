import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [preact()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
});
