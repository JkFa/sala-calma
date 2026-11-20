import { describe, expect, it } from 'vitest'
import { FLOOR_DB, l10, l90, leq, max, msToDbfs, percentile, rollingL90 } from '../src/lib/levels'

describe('msToDbfs', () => {
  it('senoide em fundo de escala = 0 dBFS', () => expect(msToDbfs(0.5)).toBeCloseTo(0, 3))
  it('silêncio vira o piso', () => expect(msToDbfs(0)).toBe(FLOOR_DB))
})

describe('Leq', () => {
  it('níveis iguais = o próprio nível', () => expect(leq([62.3, 62.3, 62.3])).toBeCloseTo(62.3, 6))
  it('é média energética, não aritmética', () => {
    // 50 e 70 dB: média de energia ≈ 67,0 dB (não 60)
    expect(leq([50, 70])).toBeCloseTo(67.04, 1)
  })
  it('lista vazia = NaN', () => expect(leq([])).toBeNaN())
})

describe('percentis', () => {
  const v = Array.from({ length: 101 }, (_, i) => 40 + i * 0.3) // 40 … 70
  it('L10 é o nível superado em 10% do tempo', () => expect(l10(v)).toBeCloseTo(67, 6))
  it('L90 é o nível superado em 90% do tempo', () => expect(l90(v)).toBeCloseTo(43, 6))
  it('interpola', () => expect(percentile([40, 50], 50)).toBe(45))
  it('máximo', () => expect(max([41, 77.7, 52])).toBe(77.7))
})

describe('L90 móvel', () => {
  it('ignora picos curtos de fala sobre um fundo constante', () => {
    const lv = Array.from({ length: 80 }, (_, i) => (i % 8 === 0 ? 72 : 48))
    const bg = rollingL90(lv, 80)
    expect(bg[79]).toBeCloseTo(48, 6)
  })
})
