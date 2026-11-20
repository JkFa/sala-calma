/** Conversões e estatística de nível sonoro. Tudo em dB, só números. */

export const FLOOR_DB = -120

/**
 * Média quadrática → dBFS (convenção AES17: senoide em fundo de escala
 * = 0 dBFS, por isso o +3,01 dB).
 */
export function msToDbfs(meanSquare: number): number {
  if (!(meanSquare > 0)) return FLOOR_DB
  return Math.max(FLOOR_DB, 10 * Math.log10(meanSquare) + 3.0103)
}

/** Nível equivalente (média energética). */
export function leq(levels: ArrayLike<number>): number {
  if (levels.length === 0) return NaN
  let sum = 0
  for (let i = 0; i < levels.length; i++) sum += Math.pow(10, levels[i] / 10)
  return 10 * Math.log10(sum / levels.length)
}

/** Percentil p (0–100) por interpolação linear. */
export function percentile(levels: ArrayLike<number>, p: number): number {
  if (levels.length === 0) return NaN
  const s = Float64Array.from(levels as ArrayLike<number>).sort()
  const pos = (p / 100) * (s.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

/** L10: nível superado em 10% do tempo (picos frequentes). */
export const l10 = (v: ArrayLike<number>) => percentile(v, 90)
/** L90: nível superado em 90% do tempo (ruído de fundo). */
export const l90 = (v: ArrayLike<number>) => percentile(v, 10)

export function max(levels: ArrayLike<number>): number {
  let m = -Infinity
  for (let i = 0; i < levels.length; i++) if (levels[i] > m) m = levels[i]
  return levels.length ? m : NaN
}

/**
 * L90 móvel: para cada janela, o L90 das janelas dos últimos `span`
 * (incluindo a atual). Estima o ruído de fundo sem contar picos curtos,
 * como a própria voz do professor.
 */
export function rollingL90(levels: ArrayLike<number>, span: number): Float64Array {
  const out = new Float64Array(levels.length)
  for (let i = 0; i < levels.length; i++) {
    const start = Math.max(0, i - span + 1)
    const slice = Array.prototype.slice.call(levels, start, i + 1) as number[]
    out[i] = percentile(slice, 10)
  }
  return out
}
