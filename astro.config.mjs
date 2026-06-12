import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// GitHub Pages（プロジェクトページ）: https://darari-nu.github.io/ai-reg-atlas/
export default defineConfig({
  site: 'https://darari-nu.github.io',
  base: '/ai-reg-atlas',
  output: 'static',
  trailingSlash: 'always',
  integrations: [react(), tailwind({ applyBaseStyles: false })],
});
