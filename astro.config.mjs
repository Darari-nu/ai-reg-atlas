import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

// 2つのデプロイ先を同じコードベースでビルドする（ASTRO_SITE/ASTRO_BASEで切替）:
// - GitHub Pages（既定・従来どおり）: https://darari-nu.github.io/ai-reg-atlas/
// - Cloudflare Pages（darari-nu.com/atlas配下、ai-kaizen-hub側のPages Functionで中継）:
//   ASTRO_SITE=https://darari-nu.com ASTRO_BASE=/atlas
export default defineConfig({
  site: process.env.ASTRO_SITE || 'https://darari-nu.github.io',
  base: process.env.ASTRO_BASE || '/ai-reg-atlas',
  output: 'static',
  trailingSlash: 'always',
  integrations: [react(), tailwind({ applyBaseStyles: false }), sitemap()],
});
