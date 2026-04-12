import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', 'VITE_');
  
  return {
    base: '/grandslam/',
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
      'import.meta.env.VITE_APP_URL': JSON.stringify(env.VITE_APP_URL || 'https://elliotttmiller.github.io/grandslam/'),
      'import.meta.env.VITE_SYNC_API_URL': JSON.stringify(env.VITE_SYNC_API_URL || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Heavy export utilities — loaded on demand when user exports
            if (id.includes('html2canvas') || id.includes('jspdf')) return 'export';
            // Framer Motion animation engine
            if (id.includes('node_modules/framer-motion') || id.includes('node_modules/motion')) return 'motion';
            // Gemini AI SDK
            if (id.includes('@google/genai')) return 'ai';
            // React core (react + react-dom bundled together to avoid circularity)
            if (id.includes('node_modules/react')) return 'react';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true' ? false : undefined,
      proxy: {
        // Forward /api/* to the pool sync server during development.
        // Start the sync server with: npm run server
        // The sync server listens on PORT (default 3001); set PORT env var to override.
        '/api': {
          target: `http://localhost:${process.env.PORT ?? '3001'}`,
          changeOrigin: true,
        },
      },
    },
  };
});
