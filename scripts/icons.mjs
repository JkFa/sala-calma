// Gera os PNGs dos ícones a partir dos SVGs. Uso: node scripts/icons.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const logo = readFileSync('public/icons/logo.svg', 'utf8')
const mask = readFileSync('public/icons/maskable.svg', 'utf8')
const jobs = [
  ['icon-192.png', logo, 192, 'transparent'],
  ['icon-512.png', logo, 512, 'transparent'],
  ['maskable-192.png', mask, 192, '#46622f'],
  ['maskable-512.png', mask, 512, '#46622f'],
  ['apple-touch-icon.png', mask, 180, '#46622f'],
]
const b = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const p = await b.newPage()
for (const [name, svg, size, bg] of jobs) {
  await p.setViewportSize({ width: size, height: size })
  await p.setContent(`<html><body style="margin:0;background:${bg}">${svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`)
  await p.screenshot({ path: `public/icons/${name}`, omitBackground: bg === 'transparent' })
}
await b.close()
