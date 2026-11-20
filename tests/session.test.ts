import { describe, expect, it } from 'vitest'
import { computeReport, finalize, newSession, openSegment, perSecond, pushLevel, bandOf } from '../src/lib/session'
import type { Calibration } from '../src/lib/calibration'

const cal: Calibration = { offset: 100, method: 'medidor', margin: 3, date: '2026-03-02T10:00:00Z', device: '' }
const T = { calmoAte: 55, altoDesde: 65, esforcoVocal: 43 }
const t0 = Date.UTC(2026, 2, 2, 10, 0, 0)

function fill(seg: { levels: number[] }, dbA: number, n: number) {
  for (let i = 0; i < n; i++) pushLevel(seg as never, dbA - 100)
}

describe('faixas', () => {
  it('classifica pelos limiares', () => {
    expect(bandOf(54.9, T)).toBe('calmo')
    expect(bandOf(55, T)).toBe('calmo')
    expect(bandOf(60, T)).toBe('atencao')
    expect(bandOf(65, T)).toBe('alto')
  })
})

describe('relatório', () => {
  it('tempo por faixa e Leq', () => {
    const s = newSession({ calibration: cal, thresholds: T, now: t0 })
    const seg = openSegment(s, t0, 'pausa')
    fill(seg, 50, 480) // 60 s calmo
    fill(seg, 70, 480) // 60 s alto
    finalize(s, t0 + 120_000)
    const r = computeReport(s)
    expect(r.calibrated).toBe(true)
    expect(r.measuredMs).toBe(120_000)
    expect(r.bandMs).toEqual({ calmo: 60_000, atencao: 0, alto: 60_000 })
    expect(r.leq).toBeCloseTo(67.04, 1)
    expect(r.max).toBe(70)
  })

  it('Tempo de Risco Vocal usa o ruído de fundo, não picos de fala', () => {
    const s = newSession({ calibration: cal, thresholds: T, now: t0 })
    const seg = openSegment(s, t0, 'pausa')
    // 60 s: fundo 40 dB com fala a 70 dB em 1/8 das janelas → fundo baixo
    for (let i = 0; i < 480; i++) pushLevel(seg, (i % 8 === 0 ? 70 : 40) - 100)
    // 60 s: fundo 50 dB constante → acima do limiar (43)
    fill(seg, 50, 480)
    const r = computeReport(s)
    // A parte com fundo 50 dB conta toda, exceto a transição de até 10 s.
    expect(r.vocalMs).toBeGreaterThan(50_000)
    expect(r.vocalMs).toBeLessThanOrEqual(60_000)
  })
})

describe('lacunas', () => {
  it('registra a lacuna entre trechos e não a conta como medição', () => {
    const s = newSession({ calibration: null, thresholds: T, now: t0 })
    const a = openSegment(s, t0, 'pausa')
    fill(a, 60, 80) // 10 s
    const b = openSegment(s, t0 + 40_000, 'segundo-plano') // 30 s fora
    fill(b, 60, 80)
    finalize(s, t0 + 50_000)
    expect(s.gaps).toEqual([{ start: t0 + 10_000, end: t0 + 40_000, reason: 'segundo-plano' }])
    const r = computeReport(s)
    expect(r.calibrated).toBe(false)
    expect(r.measuredMs).toBe(20_000)
    expect(r.gapMs).toBe(30_000)
    expect(r.gapsByReason).toEqual({ 'segundo-plano': 30_000 })
    expect(r.totalMs).toBe(50_000)
  })

  it('a série por segundo marca a lacuna com null', () => {
    const s = newSession({ calibration: cal, thresholds: T, now: t0 })
    fill(openSegment(s, t0, 'pausa'), 60, 16)
    fill(openSegment(s, t0 + 5_000, 'interrompido'), 61, 8)
    const ps = perSecond(s)
    expect(ps.map((p) => p.v)).toEqual([60, 60, null, 61])
    expect(ps[2].t).toBe(t0 + 2_000)
  })

  it('não cria lacuna para retomada imediata', () => {
    const s = newSession({ calibration: cal, thresholds: T, now: t0 })
    fill(openSegment(s, t0, 'pausa'), 60, 8)
    openSegment(s, t0 + 1_000, 'interrompido')
    expect(s.gaps).toHaveLength(0)
  })

  it('L90 móvel não atravessa lacunas', () => {
    const s = newSession({ calibration: cal, thresholds: T, now: t0 })
    fill(openSegment(s, t0, 'pausa'), 50, 80)
    fill(openSegment(s, t0 + 60_000, 'pausa'), 30, 80)
    const r = computeReport(s)
    expect(r.vocalMs).toBe(10_000)
  })

  it('finalize descarta trechos vazios', () => {
    const s = newSession({ calibration: cal, thresholds: T, now: t0 })
    fill(openSegment(s, t0, 'pausa'), 50, 8)
    openSegment(s, t0 + 9000, 'pausa')
    finalize(s, t0 + 9500)
    expect(s.segments).toHaveLength(1)
  })
})
