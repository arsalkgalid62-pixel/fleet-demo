import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const origin = new URL(env.ORIGIN || 'http://localhost:5173');
  const local = ['localhost', '127.0.0.1'].includes(origin.hostname);
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      port: local ? Number(origin.port || (origin.protocol === 'https:' ? 443 : 80)) : 5173,
      // A different port changes the Origin and the API correctly rejects writes.
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${env.PORT || 3001}` },
    },
  };
});
