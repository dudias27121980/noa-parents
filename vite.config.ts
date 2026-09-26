import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development Vite serves the app and forwards login + live sync to the shared server (npm run dev starts both)
const SERVER = `http://localhost:${process.env.PORT ?? 8787}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': SERVER,
      '/ws': { target: SERVER, ws: true },
    },
  },
});
