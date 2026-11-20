import { describe, expect, it } from 'vitest'
import { aWeightingDb, BiquadCascade, cascadeResponseDb, designAWeighting } from '../src/audio/aweighting'
import { msToDbfs } from '../src/lib/levels'

// Valores tabelados da IEC 61672-1 (curva A).
const TABLE: [number, number][] = [
  [31.5, -39.4], [63, -26.2], [125, -16.1], [250, -8.6], [500, -3.2],
  [1000, 0], [2000, 1.2], [4000, 1.0], [8000, -1.1],
]

describe('curva A analítica', () => {
  it.each(TABLE)('%d Hz ≈ %d dB', (f, db) => {
    expect(aWeightingDb(f)).toBeCloseTo(db, 0)
  })
})

describe.each([44100, 48000])('filtro biquad em %d Hz', (fs) => {
  const q = designAWeighting(fs)
  it('0 dB em 1 kHz', () => {
    expect(Math.abs(cascadeResponseDb(q, 1000, fs))).toBeLessThan(0.01)
  })
  it.each(TABLE.filter(([f]) => f <= 4000))('%d Hz dentro de ±0,5 dB da norma', (f, db) => {
    expect(Math.abs(cascadeResponseDb(q, f, fs) - db)).toBeLessThan(0.5)
  })
  it('8 kHz dentro de ±1,5 dB (achatamento da bilinear)', () => {
    expect(Math.abs(cascadeResponseDb(q, 8000, fs) - -1.1)).toBeLessThan(1.5)
  })
  it('processa senoide: 100 Hz cai ~19 dB em relação a 1 kHz', () => {
    const level = (f: number) => {
      const c = new BiquadCascade(designAWeighting(fs))
      let ms = 0
      const n = fs // 1 s
      for (let i = 0; i < n; i++) {
        const y = c.process(Math.sin((2 * Math.PI * f * i) / fs) * 0.5)
        if (i > fs / 2) ms += y * y
      }
      return msToDbfs(ms / (n - fs / 2 - 1))
    }
    const l1k = level(1000)
    expect(l1k).toBeCloseTo(-6.02, 1) // senoide de amplitude 0,5 = −6 dBFS
    expect(l1k - level(100)).toBeCloseTo(19.1, 0)
  })
})
