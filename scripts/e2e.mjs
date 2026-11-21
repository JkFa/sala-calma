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
let page = await ctx.newPage()
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
  await step('prepara banco no formato v1 (app já publicado)', async () => {
    // Abre uma página da mesma origem que não carrega o app e cria o banco
    // como a versão 1 criava, com uma aula antiga. O app deve migrar sem perder nada.
    await page.goto(URL + 'robots.txt')
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('sala-calma', 1)
          req.onupgradeneeded = () => req.result.createObjectStore('sessions', { keyPath: 'id' }).createIndex('startedAt', 'startedAt')
          req.onerror = () => reject(req.error)
          req.onsuccess = () => {
            const t0 = Date.now() - 9 * 24 * 3600 * 1000
            const levels = Array.from({ length: 2400 }, (_, i) => -42 + 6 * Math.sin(i / 90))
            const tx = req.result.transaction('sessions', 'readwrite')
            tx.objectStore('sessions').put({
              id: 'antiga-v1', turma: '8º A', disciplina: 'Geografia', startedAt: t0, endedAt: t0 + 300000, windowMs: 125,
              calibration: { offset: 104.2, method: 'medidor', margin: 3, date: new Date(t0).toISOString(), device: 'teste' },
              thresholds: { calmoAte: 55, altoDesde: 65, esforcoVocal: 43 },
              segments: [{ start: t0, levels }], gaps: [],
            })
            tx.oncomplete = () => { req.result.close(); resolve() }
          }
        }),
    )
    // A página robots.txt pede /favicon.ico (404): não é erro do app.
    errors.length = 0
  })

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
    await page.click('.activity-btn:has-text("Explicação")')
    assert.equal(await page.getAttribute('.activity-btn:has-text("Explicação")', 'aria-pressed'), 'true')
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

  await step('marca momentos; toque errado em até 10 s é corrigido', async () => {
    await page.waitForTimeout(3000) // passa de 10 s desde "Explicação"
    await page.click('.activity-btn:has-text("Grupo")')
    await page.click('.activity-btn:has-text("Prova")') // toque errado
    await page.click('.activity-btn:has-text("Grupo")') // corrige
    assert.equal(await page.getAttribute('.activity-btn:has-text("Grupo")', 'aria-pressed'), 'true')
    const marks = await page.evaluate(
      () =>
        new Promise((res) => {
          const r = indexedDB.open('sala-calma')
          r.onsuccess = () => {
            const g = r.result.transaction('sessions').objectStore('sessions').getAll()
            g.onsuccess = () => res(g.result.find((s) => s.endedAt === null)?.marks?.map((m) => m.kind))
          }
        }),
    )
    assert.deepEqual(marks, ['explicacao', 'grupo'])
    if (SHOTS) await shoot('momentos', [390])
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
    const acts = await page.textContent('.activity-table')
    assert.match(acts, /Explicação/)
    assert.match(acts, /Grupo/)
    assert.equal(await page.locator('.act-strip').count(), 1)
  })

  if (SHOTS) await shoot('relatorio')
  const reportUrl = page.url()

  await step('evolução mostra a semana e a turma (inclui aula migrada da v1)', async () => {
    await page.goto(URL + '#/evolucao')
    await page.waitForSelector('.week-now')
    const row = await page.textContent('.evolution tbody tr')
    assert.match(row, /8º A/)
    assert.equal((await page.textContent('.evolution tbody tr td.num')).trim(), '2') // aula antiga (v1) + aula de hoje
    assert.equal(await page.locator('.weekbars').count(), 2)
    assert.match(await page.textContent('.wb-vocal'), /esta/)
  })

  if (SHOTS) await shoot('evolucao')

  let roomJson
  await step('sala vazia: mede 1 minuto, compara com a OMS e salva', async () => {
    await page.goto(URL + '#/sala-vazia')
    await page.fill('#sala', 'Sala 12')
    await page.check('text=Ventilador ligado')
    await page.click('button:has-text("Medir 1 minuto")')
    await page.waitForSelector('.room-result', { timeout: 80000 })
    const txt = await page.textContent('.room-result')
    assert.match(txt, /Sala 12/)
    assert.match(txt, /Dentro da recomendação|Perto do limite|Acima da recomendação|Bem acima da recomendação/)
    assert.match(txt, /Ruído (constante|intermitente)/)
    assert.match(txt, /ventilador ligado/)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.room-result button:has-text("Arquivo para a escola")')])
    roomJson = JSON.parse((await import('node:fs')).readFileSync(await dl.path(), 'utf8'))
    assert.equal(roomJson.formato, 'sala-calma/sala-vazia')
    assert.equal(roomJson.serie.length, 60)
    // Continua salva depois de recarregar
    await page.reload()
    await page.waitForSelector('.room-result')
  })

  if (SHOTS) await shoot('sala-vazia', [390, 1280])

  let bundleTxt
  await step('compartilhar: sem menu nativo baixa o arquivo e copia o resumo', async () => {
    await ctx.grantPermissions(['microphone', 'clipboard-read', 'clipboard-write'], { origin: URL.slice(0, -1) })
    await page.goto(reportUrl)
    await page.waitForSelector('.report h1')
    assert.equal(await page.evaluate(() => typeof navigator.share), 'undefined')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Enviar para a coordenação")')])
    assert.match(dl.suggestedFilename(), /^aula_.*\.json$/)
    await page.waitForSelector('.share [role=status]:has-text("resumo foi copiado")')
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    assert.match(clip, /Sala Calma · 8º A · Geografia/)
    assert.match(clip, /abra na tela Escola de http/)
  })

  await step('compartilhar: Android recusa .json, envia .txt; "Enviar várias" junta tudo', async () => {
    // Simula o menu de compartilhar do Chrome Android: aceita .txt, recusa .json.
    await page.evaluate(() => {
      window.__shared = []
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d) => !d.files || d.files.every((f) => f.name.endsWith('.txt')) })
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (d) => {
          window.__shared.push({ text: d.text, files: await Promise.all((d.files || []).map(async (f) => ({ name: f.name, type: f.type, body: await f.text() }))) })
        },
      })
    })
    await page.click('button:has-text("Enviar para a coordenação")')
    await page.waitForSelector('.share [role=status]:has-text(".txt")')
    let shared = await page.evaluate(() => window.__shared)
    assert.match(shared[0].files[0].name, /^aula_.*\.txt$/)
    assert.equal(JSON.parse(shared[0].files[0].body).formato, 'sala-calma/aula')
    assert.match(shared[0].text, /8º A/)

    await page.goto(URL + '#/aulas') // mesma página: o menu simulado continua
    await page.selectOption('#periodo', 'todas')
    await page.click('button:has-text("Enviar 2 aulas e 1 sala vazia")')
    await page.waitForSelector('.share-msg:has-text("Enviado")')
    shared = await page.evaluate(() => window.__shared)
    const b = shared[1].files[0]
    assert.match(b.name, /^sala-calma_.*_3-registros\.txt$/)
    const items = JSON.parse(b.body)
    assert.deepEqual(items.map((x) => x.formato).sort(), ['sala-calma/aula', 'sala-calma/aula', 'sala-calma/sala-vazia'])
    bundleTxt = b.body
    if (SHOTS) await shoot('enviar-varias', [390])
  })

  await step('IndexedDB guarda só números (sem áudio)', async () => {
    const info = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('sala-calma')
          req.onerror = () => reject(req.error)
          req.onsuccess = () => {
            const tx = req.result.transaction(['sessions', 'rooms'])
            const rooms = tx.objectStore('rooms').getAll()
            const all = tx.objectStore('sessions').getAll()
            tx.oncomplete = () => {
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
              walk(rooms.result, 'rooms')
              const levels = all.result.flatMap((s) => s.segments.flatMap((g) => g.levels))
              resolve({ bad, n: all.result.length, rooms: rooms.result.length, version: req.result.version, levels: levels.length, allNumbers: levels.every((x) => typeof x === 'number') })
            }
          }
        }),
    )
    assert.equal(info.version, 2)
    assert.equal(info.n, 2) // aula migrada da v1 + aula de hoje
    assert.equal(info.rooms, 1)
    assert.deepEqual(info.bad, [])
    assert.ok(info.levels > 40, `poucos níveis: ${info.levels}`)
    assert.ok(info.allNumbers)
  })

  await step('exporta JSON e o painel da escola lê', async () => {
    await page.goto(reportUrl)
    await page.waitForSelector('.report h1')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Arquivo para a escola")')])
    const path = await dl.path()
    const json = JSON.parse((await import('node:fs')).readFileSync(path, 'utf8'))
    assert.equal(json.formato, 'sala-calma/aula')
    assert.deepEqual(json.marcas.map((m) => m[1]), ['explicacao', 'grupo'])
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
      { name: 'sala.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(roomJson)) },
      { name: 'sala-b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...roomJson, sala: 'Sala 7 (pátio)', data: '2026-03-11T13:00:00Z', leq: 47.2, l10: 55.1, l90: 41.3 })) },
      // Arquivo único enviado como .txt (Android): traz a aula migrada da v1, a de hoje (duplicada) e a sala (duplicada).
      { name: 'varias.txt', mimeType: 'text/plain', buffer: Buffer.from(bundleTxt) },
    ]
    await page.goto(URL + '#/escola')
    await page.setInputFiles('#files', files)
    await page.waitForSelector('.school-summary')
    assert.match(await page.textContent('.school-summary'), /4\s*aulas/) // 3 + aula antiga; duplicatas ignoradas
    assert.equal(await page.locator('.school-group:has(h2:has-text("Salas vazias")) tbody tr').count(), 2)
    const school = await page.textContent('.school')
    assert.match(school, /Salas vazias/)
    assert.match(school, /Por momento da aula/)
    assert.match(school, /Sala 7 \(pátio\)/)
    assert.match(school, /bem acima/)
  })

  if (SHOTS) await shoot('escola')

  await step('backup: baixa aqui e restaura em "outro aparelho" sem duplicar nem trazer a calibração', async () => {
    await page.goto(URL + '#/backup')
    await page.waitForSelector('h1:has-text("Backup")')
    assert.match(await page.textContent('.backup'), /2 aulas e 1 sala vazia/)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Baixar backup")')])
    assert.match(dl.suggestedFilename(), /^sala-calma_backup_\d{4}-\d\d-\d\d\.json$/)
    const body = (await import('node:fs')).readFileSync(await dl.path(), 'utf8')
    const b = JSON.parse(body)
    assert.equal(b.formato, 'sala-calma/backup')
    assert.equal(b.aulas.length, 2)
    assert.equal(b.salas.length, 1)
    assert.equal(b.ajustes.calibration.offset, 104.2)
    assert.match(await page.textContent('.backup'), /Último backup:/)
    if (SHOTS) await shoot('backup', [390])

    // Outro aparelho: navegador limpo, com a própria calibração.
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' })
    const p2 = await ctx2.newPage()
    p2.on('pageerror', (e) => errors.push('[aparelho 2] ' + e.message))
    await p2.goto(URL + '#/backup')
    await p2.evaluate(() =>
      localStorage.setItem('sala-calma:ajustes', JSON.stringify({ calibration: { offset: 97.5, method: 'medidor', margin: 3, date: new Date().toISOString(), device: 'aparelho 2' } })),
    )
    await p2.reload()
    await p2.waitForSelector('h1:has-text("Backup")')
    // Arquivo errado: um arquivo de aula (para a coordenação)
    await p2.setInputFiles('#backup-file', { name: 'aula.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ formato: 'sala-calma/aula' })) })
    await p2.waitForSelector('.note-error:has-text("não é um backup")')
    // Backup chegando como .txt (Android)
    const file = { name: 'sala-calma_backup.txt', mimeType: 'text/plain', buffer: Buffer.from(body) }
    await p2.setInputFiles('#backup-file', file)
    await p2.waitForSelector('.restore-plan')
    const prev = await p2.textContent('.restore-plan')
    assert.match(prev, /2 aulas novas/)
    assert.match(prev, /1 sala vazia nova/)
    assert.equal(await p2.isChecked('text=Usar a calibração do backup'), false)
    if (SHOTS) {
      const keep = page
      page = p2
      await shoot('restaurar', [390])
      page = keep
    }
    await p2.click('.restore-plan button:has-text("Restaurar")')
    await p2.waitForSelector('.note:has-text("2 aulas restauradas")')
    const cal = await p2.evaluate(() => JSON.parse(localStorage.getItem('sala-calma:ajustes')).calibration.offset)
    assert.equal(cal, 97.5, 'a calibração deste aparelho foi mantida')
    await p2.goto(URL + '#/aulas')
    await p2.waitForSelector('.ledger tbody tr')
    assert.equal(await p2.locator('.ledger tbody tr').count(), 2)
    // Relatório restaurado abre, com a calibração original da aula (dB(A))
    await p2.click('.ledger tbody tr a')
    await p2.waitForSelector('.report h1')
    assert.match(await p2.textContent('.report-head'), /calibrado/)
    // Restaurar de novo não duplica
    await p2.goto(URL + '#/backup')
    await p2.setInputFiles('#backup-file', file)
    await p2.waitForSelector('.restore-plan')
    assert.match(await p2.textContent('.restore-plan'), /0 aulas novas; 2 já estão neste aparelho/)
    await ctx2.close()
  })

  await step('lembrete de pausa vocal: aparece sem som, some com Ok, não vai para o semáforo, entra no relatório', async () => {
    // Navegador separado, com o lembrete em 3 s (só possível pelo armazenamento; a tela oferece 10+ min).
    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' })
    await ctx3.grantPermissions(['microphone'], { origin: URL.slice(0, -1) })
    const p3 = await ctx3.newPage()
    p3.on('pageerror', (e) => errors.push('[lembrete] ' + e.message))
    await p3.goto(URL + '#/medir')
    await p3.evaluate(() =>
      localStorage.setItem(
        'sala-calma:ajustes',
        JSON.stringify({ lembreteVocalMin: 0.05, calibration: { offset: 104.2, method: 'medidor', margin: 3, date: new Date().toISOString(), device: 't' } }),
      ),
    )
    await p3.reload()
    // Nenhum som pode tocar: conta AudioContext tocando para a saída.
    await p3.evaluate(() => {
      window.__sons = 0
      const orig = AudioNode.prototype.connect
      AudioNode.prototype.connect = function (dest, ...r) {
        if (dest instanceof AudioDestinationNode) window.__sons++
        return orig.call(this, dest, ...r)
      }
    })
    await p3.click('button:has-text("Começar a medir")')
    await p3.waitForSelector('.vocal-break', { timeout: 15000 })
    assert.match(await p3.textContent('.vocal-break'), /pausa de voz/)
    assert.equal(await p3.evaluate(() => window.__sons), 0)
    if (SHOTS) {
      const keep = page
      page = p3
      await shoot('pausa-vocal', [390])
      page = keep
    }
    await p3.click('.vocal-break button:has-text("Ok")')
    assert.equal(await p3.locator('.vocal-break').count(), 0)
    // Em outra tela, só a marquinha no topo
    await p3.goto(URL + '#/aulas')
    await p3.waitForSelector('.live-break', { timeout: 10000 })
    // No semáforo projetado, nada de lembrete
    await p3.goto(URL + '#/semaforo')
    await p3.waitForSelector('.light-word', { timeout: 8000 })
    await p3.waitForTimeout(3500)
    assert.equal(await p3.locator('.vocal-break, .live-break').count(), 0)
    await p3.goto(URL + '#/medir')
    await p3.click('button:has-text("Encerrar aula")')
    await p3.waitForSelector('.report h1')
    const v = await p3.textContent('.vocal')
    assert.match(v, /O app sugeriu pausa de voz (uma vez|\d+ vezes)/)
    await ctx3.close()
  })

  await step('semáforo: cronômetro marca o momento, +1 min, meta da semana, modo sem números', async () => {
    const ctx4 = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR' })
    await ctx4.grantPermissions(['microphone'], { origin: URL.slice(0, -1) })
    const p4 = await ctx4.newPage()
    p4.on('pageerror', (e) => errors.push('[semáforo] ' + e.message))
    await p4.goto(URL + '#/medir')
    await p4.evaluate(() =>
      localStorage.setItem('sala-calma:ajustes', JSON.stringify({ metaSemanalMin: 60, calibration: { offset: 104.2, method: 'medidor', margin: 3, date: new Date().toISOString(), device: 't' } })),
    )
    await p4.reload()
    // 1ª aula da turma, para a semana ter o que somar
    await p4.fill('#turma', '6º C')
    await p4.click('button:has-text("Começar a medir")')
    await p4.waitForSelector('.reading-band', { timeout: 10000 })
    await p4.waitForTimeout(5000)
    await p4.click('button:has-text("Encerrar aula")')
    await p4.waitForSelector('.report h1')
    // 2ª aula, escrita diferente (" 6º c"): a semana soma as duas
    await p4.goto(URL + '#/medir')
    await p4.fill('#turma', ' 6º c')
    await p4.click('button:has-text("Começar a medir")')
    await p4.waitForSelector('.reading-band', { timeout: 10000 })
    await p4.goto(URL + '#/semaforo')
    await p4.waitForSelector('.light-week')
    assert.match(await p4.textContent('.light-week'), /Esta semana, 6º c: .+ de sala calma de 1 h 00 min/)
    // Cronômetro com momento
    await p4.click('button:has-text("Cronômetro")')
    await p4.click('.timer-panel button:has-text("3 min")')
    await p4.click('.timer-panel button:has-text("Grupo")')
    await p4.click('.timer-panel button:has-text("Começar 3 min")')
    await p4.waitForSelector('.light-timer-clock')
    assert.match(await p4.textContent('.light-timer'), /Grupo/)
    assert.match(await p4.textContent('.light-timer-clock'), /^(3:00|2:5\d)$/)
    await p4.click('.light-bar button:has-text("+1 min")')
    assert.match(await p4.textContent('.light-timer-clock'), /^(4:00|3:5\d)$/)
    if (SHOTS) {
      await p4.waitForTimeout(800)
      await p4.screenshot({ path: 'docs/screenshots/semaforo-cronometro-1280.png' })
    }
    const marks = await p4.evaluate(
      () =>
        new Promise((res) => {
          const r = indexedDB.open('sala-calma')
          r.onsuccess = () => {
            const g = r.result.transaction('sessions').objectStore('sessions').getAll()
            g.onsuccess = () => res(g.result.find((s) => s.endedAt === null)?.marks?.map((m) => m.kind))
          }
        }),
    )
    assert.deepEqual(marks, ['grupo'])
    // Sair e voltar: o cronômetro continua
    await p4.goto(URL + '#/medir')
    await p4.goto(URL + '#/semaforo')
    await p4.waitForSelector('.light-timer-clock')
    // Modo sem números (pelo Ajustes, sem perder a aula)
    await p4.goto(URL + '#/ajustes')
    await p4.check('text=Sem números (turmas pequenas)')
    await p4.goto(URL + '#/semaforo')
    await p4.waitForSelector('.dots')
    assert.equal(await p4.locator('.light-timer-clock').count(), 0)
    assert.doesNotMatch(await p4.textContent('.light-goal'), /\d/)
    assert.doesNotMatch(await p4.textContent('.light-timer'), /\d/)
    if (SHOTS) {
      await p4.waitForTimeout(800)
      await p4.screenshot({ path: 'docs/screenshots/semaforo-sem-numeros-1280.png' })
    }
    await p4.click('.light-bar button:has-text("Parar")')
    assert.equal(await p4.locator('.light-timer').count(), 0)
    await ctx4.close()
  })

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
