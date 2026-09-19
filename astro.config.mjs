import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

// 公開先は Cloudflare Pages の darari-nu.com/atlas 1本（2026-09-19にGitHub Pages併載を終了）。
// ai-kaizen-hub側のPages Functionが中継する。環境変数で差し替え可能。
export default defineConfig({
  site: process.env.ASTRO_SITE || 'https://darari-nu.com',
  base: process.env.ASTRO_BASE || '/atlas',
  output: 'static',
  trailingSlash: 'always',
  integrations: [react(), tailwind({ applyBaseStyles: false }), sitemap()],
});
