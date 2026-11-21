import { describe, expect, it } from 'vitest'
import { timelineRange } from '../src/ui/charts'

const t = { calmoAte: 55, altoDesde: 65, esforcoVocal: 43 }

describe('escala do gráfico da aula', () => {
  it('com valores perto das faixas, mostra os limiares', () => {
    const r = timelineRange([48, 60, 72], t)
    expect(r.lo).toBeLessThanOrEqual(45)
    expect(r.hi).toBeGreaterThanOrEqual(71)
  })
  it('com microfone de computador (valores baixos), foca nos dados', () => {
    const r = timelineRange([31, 34, 37], t)
    expect(r.hi).toBeLessThan(t.calmoAte)
    expect(r.hi - r.lo).toBeLessThanOrEqual(20)
    expect(r.lo).toBeLessThanOrEqual(31)
  })
  it('nunca fica mais estreita que 12 dB', () => {
    const r = timelineRange([34, 34.2], t)
    expect(r.hi - r.lo).toBeGreaterThanOrEqual(12)
  })
})
