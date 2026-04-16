import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = mode === 'production';
  const outDir = isProd ? 'dist-prod' : 'dist';

  return {
    base: './',
    plugins: [
      tailwindcss(),
      react(),
      {
        name: 'copy-manifest',
        closeBundle() {
          if (!existsSync(outDir)) {
            mkdirSync(outDir, { recursive: true });
          }

          // Копируем manifest.json
          const manifestSrc = isProd && existsSync('public/manifest.prod.json')
            ? 'public/manifest.prod.json'
            : 'public/manifest.json';
          copyFileSync(manifestSrc, `${outDir}/manifest.json`);

          // Копируем иконки
          if (!existsSync(`${outDir}/icons`)) {
            mkdirSync(`${outDir}/icons`, { recursive: true });
          }
          const iconSizes = [16, 32, 48, 128];
          iconSizes.forEach((size) => {
            const iconDir = isProd && existsSync(`public/icons-prod`) ? 'public/icons-prod' : 'public/icons';
            const src = `${iconDir}/icon${size}.png`;
            const dest = `${outDir}/icons/icon${size}.png`;
            if (existsSync(src)) {
              copyFileSync(src, dest);
            }
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@components': resolve(__dirname, 'src/components'),
        '@pages': resolve(__dirname, 'src/pages'),
        '@db': resolve(__dirname, 'src/db'),
        '@services': resolve(__dirname, 'src/services'),
        '@constants': resolve(__dirname, 'src/constants'),
        '@types': resolve(__dirname, 'src/types'),
        '@utils': resolve(__dirname, 'src/utils'),
      },
    },
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'src/popup/popup.html'),
          search: resolve(__dirname, 'src/pages/search/search.html'),
          background: resolve(__dirname, 'src/background/service-worker.ts'),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'background') {
              return 'background/service-worker.js';
            }
            return 'assets/[name]-[hash].js';
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
    },
  };
});
