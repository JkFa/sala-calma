import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { APP } from './src/config.ts'

// BASE=/sala-calma/ para GitHub Pages; "/" para Vercel.
const base = process.env.BASE ?? '/'

export default defineConfig({
  base,
  plugins: [
    preact(),
    {
      name: 'app-config-html',
      transformIndexHtml: (html) =>
        html
          .replaceAll('%APP_NAME%', APP.name)
          .replaceAll('%APP_DESCRIPTION%', APP.description)
          .replaceAll('%THEME_COLOR%', APP.themeColor),
    },
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        id: base,
        name: APP.name,
        short_name: APP.shortName,
        description: APP.description,
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: './#/medir',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: APP.backgroundColor,
        theme_color: APP.themeColor,
        categories: ['education', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Medir', url: './#/medir' },
          { name: 'Semáforo', url: './#/semaforo' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2020',
    // O worklet precisa ser arquivo próprio (data: URL falha no Safari).
    assetsInlineLimit: (file) => (file.includes('level-processor') ? false : undefined),
  },
})
