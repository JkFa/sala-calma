/**
 * Teste ponta a ponta no Chrome, com microfone falso.
 * Uso: npm run build && npm run test:e2e   (SHOTS=1 salva screenshots em docs/screenshots)
 *
 * Verifica:
 *  - a medição funciona (AudioWorklet) e mostra a faixa;
 *  - NENHUMA requisição de rede durante a medição;
 *  - o IndexedDB guarda só números e textos curtos (nada de áudio);
 *  - pausa vira lacuna no relatório;
 *  - o app abre offline depois da primeira visita;
 *  - o manifest é instalável (sem erros de instalabilidade).
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Som de sala sintético (ruído + "fala"), em vez do bipe padrão do Chrome.
const WAV = join(tmpdir(), 'sala-calma-teste.wav')
execFileSync('node', ['scripts/sala-wav.mjs', WAV])

const PORT = 4179
const URL = `http://localhost:${PORT}/`
const SHOTS = !!process.env.SHOTS

const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' })
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => String(d).includes('localhost') && res())
  server.on('exit', rej)
  setTimeout(() => rej(new Error('preview não subiu')), 20000)
})

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${WAV}`, '--autoplay-policy=no-user-gesture-required'],
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'pt-BR' })
await ctx.grantPermissions(['microphone'], { origin: URL.slice(0, -1) })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

let ok = 0
const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `)
  await fn()
  ok++
  console.log('ok')
}

try {
  await step('abre e registra o service worker', async () => {
    await page.goto(URL)
    await page.waitForFunction(async () => {
      const r = await navigator.serviceWorker.getRegistration()
      return !!r?.active
    }, null, { timeout: 15000 })
    await page.waitForLoadState('networkidle')
  })

  await step('manifest sem erros de instalabilidade', async () => {
    const cdp = await ctx.newCDPSession(page)
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
    // "in-incognito" só aparece porque o Playwright usa perfil temporário.
    const real = installabilityErrors.filter((e) => e.errorId !== 'in-incognito')
    assert.deepEqual(real, [], JSON.stringify(real))
    const m = await (await page.request.get(URL + 'manifest.webmanifest')).json()
    assert.equal(m.lang, 'pt-BR')
    assert.equal(m.display, 'standalone')
    assert.ok(m.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'))
  })

  if (SHOTS) await shoot('inicio')

  const requests = []
  await step('mede com o microfone e mostra a faixa', async () => {
    // Simula um aparelho calibrado (offset típico), para testar o modo dB(A).
    await page.evaluate(() =>
      localStorage.setItem('sala-calma:ajustes', JSON.stringify({ calibration: { offset: 104.2, method: 'medidor', margin: 3, date: new Date().toISOString(), device: 'teste' } })),
    )
    await page.goto(URL + '#/medir')
    await page.reload()
    await page.fill('#turma', '8º A')
    await page.fill('#disc', 'Geografia')
    page.on('requestfinished', async (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData(), sw: (await r.response())?.fromServiceWorker() }))
    await page.click('button:has-text("Começar a medir")')
    await page.waitForSelector('.reading-band', { timeout: 10000 })
    await page.waitForTimeout(6000)
    const band = await page.textContent('.reading-band')
    assert.match(band, /Calmo|Atenção|Alto/)
  })

  await step('nenhuma requisição de rede durante a medição', async () => {
    // Só vale: ler arquivo do próprio app (GET, sem corpo) do cache offline.
    // Qualquer coisa que saia para a rede ou leve dados reprova.
    const net = requests.filter((r) => !r.url.startsWith('data:') && !r.url.startsWith('blob:'))
    const bad = net.filter((r) => r.method !== 'GET' || r.body || !r.sw || !r.url.startsWith(URL))
    assert.deepEqual(bad, [], 'requisições: ' + JSON.stringify(bad))
    console.log(`(${net.length} leitura(s) do cache local, 0 na rede) `)
  })

  if (SHOTS) await shoot('medir-ao-vivo')

  await step('semáforo acende', async () => {
    await page.goto(URL + '#/semaforo')
    await page.waitForSelector('.light-word', { timeout: 8000 })
    if (SHOTS) {
      await page.waitForTimeout(1500)
      await shoot('semaforo', [390, 1280])
    }
    await page.goto(URL + '#/medir')
  })

  await step('pausa vira lacuna; encerra e abre relatório', async () => {
    await page.waitForTimeout(1500)
    await page.click('button:has-text("Pausar")')
    await page.waitForTimeout(2500)
    await page.click('button:has-text("Retomar")')
    await page.waitForTimeout(3000)
    await page.click('button:has-text("Encerrar aula")')
    await page.waitForSelector('.report h1')
    assert.match(await page.textContent('.report h1'), /8º A · Geografia/)
    assert.match(await page.textContent('.report'), /Períodos sem medição/)
    assert.match(await page.textContent('.report'), /pausa sua/)
  })

  if (SHOTS) await shoot('relatorio')

  await step('IndexedDB guarda só números (sem áudio)', async () => {
    const info = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('sala-calma')
          req.onerror = () => reject(req.error)
          req.onsuccess = () => {
            const tx = req.result.transaction('sessions')
            const all = tx.objectStore('sessions').getAll()
            all.onsuccess = () => {
              const bad = []
              const walk = (v, path) => {
                if (v === null || ['number', 'boolean'].includes(typeof v)) return
                if (typeof v === 'string') {
                  if (v.length > 200) bad.push(path + ': texto longo')
                  return
                }
                if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`))
                if (v instanceof Blob || v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return bad.push(path + ': binário')
                if (typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`)
              }
              walk(all.result, 'sessions')
              const levels = all.result.flatMap((s) => s.segments.flatMap((g) => g.levels))
              resolve({ bad, n: all.result.length, levels: levels.length, allNumbers: levels.every((x) => typeof x === 'number') })
            }
          }
        }),
    )
    assert.equal(info.n, 1)
    assert.deepEqual(info.bad, [])
    assert.ok(info.levels > 40, `poucos níveis: ${info.levels}`)
    assert.ok(info.allNumbers)
  })

  await step('exporta JSON e o painel da escola lê', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Arquivo para a escola")')])
    const path = await dl.path()
    const json = JSON.parse((await import('node:fs')).readFileSync(path, 'utf8'))
    assert.equal(json.formato, 'sala-calma/aula')
    // Duas aulas fictícias extras para o painel ter o que agregar.
    const extra = (turma, iso, leq, alto) => ({
      ...json,
      turma,
      inicio: iso,
      resumo: { ...json.resumo, leq, minutosMedidos: 48, minutosPorFaixa: { calmo: 48 - alto - 9, atencao: 9, alto }, minutosEsforcoVocal: 31 },
    })
    const files = [
      { name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) },
      { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(extra('6º C', '2026-03-10T10:20:00-03:00', 68.3, 21.5))) },
      { name: 'c.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(extra('9º B', '2026-03-12T14:00:00-03:00', 61.7, 6.2))) },
    ]
    await page.goto(URL + '#/escola')
    await page.setInputFiles('#files', files)
    await page.waitForSelector('.school-summary')
    assert.match(await page.textContent('.school-summary'), /3\s*aulas/)
  })

  if (SHOTS) await shoot('escola')

  await step('abre offline depois da primeira visita', async () => {
    await ctx.setOffline(true)
    await page.goto(URL + '#/ajustes')
    await page.waitForSelector('h1:has-text("Ajustes")', { timeout: 8000 })
    await ctx.setOffline(false)
  })

  if (SHOTS) {
    await page.goto(URL + '#/calibrar')
    await shoot('calibrar')
    await page.goto(URL + '#/privacidade')
    await shoot('privacidade', [390])
  }

  await step('sem erros no console', async () => {
    const relevant = errors.filter((e) => !/Failed to load resource.*ERR_INTERNET_DISCONNECTED/.test(e))
    assert.deepEqual(relevant, [])
  })

  console.log(`\n${ok} verificações passaram.`)
} catch (e) {
  console.log('FALHOU')
  console.error(e)
  if (errors.length) console.error('Erros da página:', errors)
  process.exitCode = 1
} finally {
  await browser.close()
  server.kill()
}

async function shoot(name, widths = [360, 390, 768, 1280]) {
  mkdirSync('docs/screenshots', { recursive: true })
  const orig = page.viewportSize()
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: w >= 1280 ? 860 : w >= 768 ? 1024 : 800 })
    await page.waitForTimeout(250)
    await page.screenshot({ path: `docs/screenshots/${name}-${w}.png`, fullPage: name !== 'semaforo' })
  }
  await page.setViewportSize(orig)
  writeFileSync('docs/screenshots/.keep', '')
}
