/**
 * Ponderação A (IEC 61672-1) aproximada por três biquads, obtidos pela
 * transformada bilinear do filtro analógico:
 *
 *   H(s) = K·s⁴ / [(s+ω1)²·(s+ω2)·(s+ω3)·(s+ω4)²]
 *
 * Seções: s²/(s+ω1)²  ·  s²/((s+ω2)(s+ω3))  ·  1/(s+ω4)²
 * O ganho é normalizado para 0 dB em 1 kHz. Perto de Nyquist (acima de
 * ~10 kHz em 48 kHz) a bilinear achata a resposta; para voz e ruído de
 * sala isso é irrelevante.
 */

export interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

const F1 = 20.598997
const F2 = 107.65265
const F3 = 737.86223
const F4 = 12194.217

/** Ganho analítico da curva A, em dB (referência para testes). */
export function aWeightingDb(f: number): number {
  const f2 = f * f
  const num = F4 * F4 * f2 * f2
  const den =
    (f2 + F1 * F1) *
    Math.sqrt((f2 + F2 * F2) * (f2 + F3 * F3)) *
    (f2 + F4 * F4)
  return 20 * Math.log10(num / den) + 2.0
}

/** Bilinear de (B2 s² + B1 s + B0)/(A2 s² + A1 s + A0), com k = 2·fs. */
function bilinear(
  B2: number,
  B1: number,
  B0: number,
  A2: number,
  A1: number,
  A0: number,
  fs: number,
): Biquad {
  const k = 2 * fs
  const k2 = k * k
  const b0 = B2 * k2 + B1 * k + B0
  const b1 = -2 * B2 * k2 + 2 * B0
  const b2 = B2 * k2 - B1 * k + B0
  const a0 = A2 * k2 + A1 * k + A0
  const a1 = -2 * A2 * k2 + 2 * A0
  const a2 = A2 * k2 - A1 * k + A0
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

/** Resposta em magnitude (dB) de uma cascata, na frequência f. */
export function cascadeResponseDb(sections: Biquad[], f: number, fs: number): number {
  const w = (2 * Math.PI * f) / fs
  // z^-1 = e^{-jw}
  const c1 = Math.cos(w)
  const s1 = -Math.sin(w)
  const c2 = Math.cos(2 * w)
  const s2 = -Math.sin(2 * w)
  let mag = 1
  for (const q of sections) {
    const nr = q.b0 + q.b1 * c1 + q.b2 * c2
    const ni = q.b1 * s1 + q.b2 * s2
    const dr = 1 + q.a1 * c1 + q.a2 * c2
    const di = q.a1 * s1 + q.a2 * s2
    mag *= Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di))
  }
  return 20 * Math.log10(mag)
}

export function designAWeighting(fs: number): Biquad[] {
  const w1 = 2 * Math.PI * F1
  const w2 = 2 * Math.PI * F2
  const w3 = 2 * Math.PI * F3
  const w4 = 2 * Math.PI * F4
  const sections = [
    bilinear(1, 0, 0, 1, 2 * w1, w1 * w1, fs),
    bilinear(1, 0, 0, 1, w2 + w3, w2 * w3, fs),
    bilinear(0, 0, 1, 1, 2 * w4, w4 * w4, fs),
  ]
  // Normaliza em 1 kHz: aplica o ganho na última seção.
  const g = Math.pow(10, -cascadeResponseDb(sections, 1000, fs) / 20)
  const last = sections[2]
  last.b0 *= g
  last.b1 *= g
  last.b2 *= g
  return sections
}

/** Filtro em cascata, forma direta II transposta. Processa no lugar. */
export class BiquadCascade {
  private z1: Float64Array
  private z2: Float64Array
  private sections: Biquad[]
  constructor(sections: Biquad[]) {
    this.sections = sections
    this.z1 = new Float64Array(sections.length)
    this.z2 = new Float64Array(sections.length)
  }
  process(x: number): number {
    let y = x
    for (let i = 0; i < this.sections.length; i++) {
      const q = this.sections[i]
      const out = q.b0 * y + this.z1[i]
      this.z1[i] = q.b1 * y - q.a1 * out + this.z2[i]
      this.z2[i] = q.b2 * y - q.a2 * out
      y = out
    }
    return y
  }
}
