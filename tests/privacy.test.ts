/**
 * Garantias estáticas de privacidade: o código do app não grava áudio
 * e não tem nenhum caminho de envio de dados pela rede.
 * (O teste e2e confirma o mesmo em execução: scripts/e2e.mjs.)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|js)$/.test(p) ? [p] : []
  })
}
const stripComments = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const src = files('src').map((p) => ({ p, code: stripComments(readFileSync(p, 'utf8')) }))

const FORBIDDEN: [string, RegExp][] = [
  ['gravação de áudio', /MediaRecorder|createMediaStreamDestination|captureStream/],
  ['fetch', /\bfetch\s*\(/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['sendBeacon', /sendBeacon/],
  ['WebSocket', /WebSocket|EventSource|RTCPeerConnection/],
  ['scripts/fontes externos', /https?:\/\/(fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg|jsdelivr|www\.googletagmanager)/],
]

describe('privacidade', () => {
  it.each(FORBIDDEN)('nenhum uso de %s no código do app', (_, re) => {
    const hits = src.filter(({ code }) => re.test(code)).map(({ p }) => p)
    expect(hits).toEqual([])
  })

  it('o worklet só envia três números por janela', () => {
    const w = readFileSync('src/audio/level-processor.js', 'utf8')
    const posts = w.match(/postMessage\(([^)]*)\)/g) ?? []
    expect(posts).toEqual(['postMessage([this.sumA[best] / this.n, this.sumZ[best] / this.n, this.peak])'])
  })

  it('o modo AnalyserNode zera os buffers após cada leitura', () => {
    const m = readFileSync('src/audio/meter.ts', 'utf8')
    expect(m).toMatch(/bufA\.fill\(0\)/)
    expect(m).toMatch(/bufZ\.fill\(0\)/)
  })

  it('o microfone é pedido sem processamento do navegador', () => {
    const m = readFileSync('src/audio/meter.ts', 'utf8')
    for (const k of ['echoCancellation: false', 'noiseSuppression: false', 'autoGainControl: false']) expect(m).toContain(k)
  })
})
