import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        story: resolve(__dirname, 'src/story.html'),
        news: resolve(__dirname, 'src/news.html'),
        events: resolve(__dirname, 'src/events.html'),
        resources: resolve(__dirname, 'src/resources.html'),
        about: resolve(__dirname, 'src/about.html'),
        donate: resolve(__dirname, 'src/donate.html'),
        notfound: resolve(__dirname, 'src/404.html'),
        // Make shared.js a top-level entry so it gets a stable filename.
        // Required because worker shellPage emits literal `/shared.js` URLs.
        shared: resolve(__dirname, 'src/shared.js')
      },
      // Stable filenames for the CSS + key JS so worker SSR pages can reference
      // them by predictable URLs. Hashed asset names break worker shellPage
      // which emits /style.css and /shared.js literal references.
      output: {
        assetFileNames: (info) => {
          const name = info.name || '';
          if (name.endsWith('.css')) return 'style.css';
          return 'assets/[name]-[hash][extname]';
        },
        entryFileNames: (info) => {
          if (info.name === 'shared') return 'shared.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js'
      }
    }
  }
});
