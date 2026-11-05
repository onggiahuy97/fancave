import { defineConfig } from 'vite';

const SERVER = process.env.FANCAVE_SERVER ?? 'http://localhost:2567';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    proxy: {
      // Same path layout as production (Caddy): /colyseus/* -> game server.
      '/colyseus': {
        target: SERVER,
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/colyseus/, ''),
      },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
});
