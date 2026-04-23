import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', 'VITE_');
  
  // VITE_BASE_PATH is set by the GitHub Actions deploy workflow to
  // `/<repo-name>/`, so forked repos and renames work automatically.
  const basePath = env.VITE_BASE_PATH || '/grandslam/';

  return {
    base: basePath,
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_APP_URL': JSON.stringify(env.VITE_APP_URL || 'https://elliotttmiller.github.io/grandslam/'),
      'import.meta.env.VITE_GOOGLE_CLOUD_PROJECT': JSON.stringify(env.VITE_GOOGLE_CLOUD_PROJECT),
      'import.meta.env.VITE_GOOGLE_CLOUD_LOCATION': JSON.stringify(env.VITE_GOOGLE_CLOUD_LOCATION || 'global'),
      'import.meta.env.VITE_GOOGLE_CREDENTIALS_JSON': JSON.stringify(env.VITE_GOOGLE_CREDENTIALS_JSON),
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
            // Firebase SDK
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
            // React core (react + react-dom bundled together to avoid circularity)
            if (id.includes('node_modules/react')) return 'react';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
    },
  };
});
