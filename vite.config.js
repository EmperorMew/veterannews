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
        notfound: resolve(__dirname, 'src/404.html')
      }
    }
  }
});
