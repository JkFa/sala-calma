import { describe, expect, it } from 'vitest'
import { analyzeStreaks, VocalStreak } from '../src/lib/vocalbreak'
import { finalize, newSession, openSegment, pushLevel } from '../src/lib/session'

const W = 125
const MIN = 60_000
function feed(st: VocalStreak, bg: number, ms: number) {
  let alerts = 0
  for (let t = 0; t < ms; t += W) if (st.update(bg, W)) alerts++
  return alerts
}

describe('sequência de esforço vocal', () => {
  it('avisa ao passar de N minutos seguidos, e de novo após mais N', () => {
    const st = new VocalStreak({ threshold: 43, alertAfterMs: 15 * MIN })
    expect(feed(st, 50, 15 * MIN - W)).toBe(0)
    expect(feed(st, 50, W)).toBe(1)
    expect(feed(st, 50, 14 * MIN)).toBe(0)
    expect(feed(st, 50, MIN)).toBe(1)
    expect(st.streakMs).toBe(30 * MIN)
  })
  it('queda curta (< 1 min) só pausa a contagem', () => {
    const st = new VocalStreak({ threshold: 43, alertAfterMs: 15 * MIN })
    feed(st, 50, 10 * MIN)
    feed(st, 40, 40_000)
    expect(st.streakMs).toBe(10 * MIN)
    expect(feed(st, 50, 5 * MIN)).toBe(1)
  })
  it('1 min abaixo do limiar zera', () => {
    const st = new VocalStreak({ threshold: 43, alertAfterMs: 15 * MIN })
    feed(st, 50, 14 * MIN)
    feed(st, 40, MIN)
    expect(st.streakMs).toBe(0)
    expect(feed(st, 50, 14 * MIN)).toBe(0)
    expect(st.longestMs).toBe(14 * MIN)
  })
  it('lacuna longa zera; curta não', () => {
    const st = new VocalStreak({ threshold: 43, alertAfterMs: 15 * MIN })
    feed(st, 50, 10 * MIN)
    st.gap(20_000)
    expect(st.streakMs).toBe(10 * MIN)
    st.gap(50_000)
    expect(st.streakMs).toBe(0)
  })
  it('igual ao limiar não conta (precisa passar)', () => {
    const st = new VocalStreak({ threshold: 43, alertAfterMs: MIN })
    expect(feed(st, 43, 2 * MIN)).toBe(0)
  })
  it('desligado nunca avisa, mas mede a maior sequência', () => {
    const st = new VocalStreak({ threshold: 43, alertAfterMs: 0 })
    expect(feed(st, 50, 40 * MIN)).toBe(0)
    expect(st.longestMs).toBe(40 * MIN)
  })
})

describe('análise de aula gravada', () => {
  const cal = { offset: 100, method: 'medidor' as const, margin: 3, date: '', device: '' }
  const T = { calmoAte: 55, altoDesde: 65, esforcoVocal: 43 }
  const t0 = Date.UTC(2026, 2, 2, 13)
  function lesson(parts: [number, number][], gapAfterFirstMs = 0) {
    const s = newSession({ calibration: cal, thresholds: T, now: t0 })
    let seg = openSegment(s, t0, 'pausa')
    let t = t0
    parts.forEach(([db, ms], i) => {
      if (i === 1 && gapAfterFirstMs) {
        t += gapAfterFirstMs
        seg = openSegment(s, t, 'pausa')
      }
      for (let k = 0; k < ms / W; k++) pushLevel(seg, db - 100)
      t += ms
    })
    finalize(s, t)
    return s
  }
  it('maior sequência e instantes dos lembretes', () => {
    const r = analyzeStreaks(lesson([[50, 32 * MIN], [38, 5 * MIN], [50, 10 * MIN]]), 15 * MIN)
    expect(r.longestMs).toBeGreaterThanOrEqual(31 * MIN)
    expect(r.alerts).toHaveLength(2)
    expect(r.alerts[0] - t0).toBeGreaterThanOrEqual(15 * MIN)
    expect(r.alerts[0] - t0).toBeLessThan(15 * MIN + 15_000)
  })
  it('pausa longa entre trechos quebra a sequência', () => {
    const r = analyzeStreaks(lesson([[50, 10 * MIN], [50, 10 * MIN]], 3 * MIN), 15 * MIN)
    expect(r.alerts).toHaveLength(0)
    expect(r.longestMs).toBeLessThanOrEqual(10 * MIN)
  })
  it('pausa curta entre trechos não quebra', () => {
    const r = analyzeStreaks(lesson([[50, 10 * MIN], [50, 10 * MIN]], 20_000), 15 * MIN)
    expect(r.alerts).toHaveLength(1)
  })
})
