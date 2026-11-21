/** Cronômetro de atividade do semáforo (contagem regressiva). */

export interface Countdown {
  /** epoch ms do fim */
  endAt: number
  /** duração total (ms), para a barra */
  totalMs: number
  /** rótulo opcional (ex.: "Grupo") */
  label: string
}

export function startCountdown(minutes: number, label = '', now = Date.now()): Countdown {
  const totalMs = Math.round(minutes * 60_000)
  return { endAt: now + totalMs, totalMs, label }
}

/** Mais tempo: estende o fim e a duração total (a barra não "volta"). */
export function extend(c: Countdown, ms: number, now = Date.now()): Countdown {
  const base = Math.max(c.endAt, now)
  const elapsed = c.totalMs - Math.max(0, c.endAt - now)
  return { ...c, endAt: base + ms, totalMs: elapsed + (base + ms - now) }
}

export interface CountdownView {
  remainingMs: number
  /** fração que ainda falta, 1 → 0 */
  fraction: number
  done: boolean
  /** "7:32" */
  clock: string
}

export function view(c: Countdown, now = Date.now()): CountdownView {
  const remainingMs = Math.max(0, c.endAt - now)
  const s = Math.ceil(remainingMs / 1000)
  return {
    remainingMs,
    fraction: c.totalMs > 0 ? remainingMs / c.totalMs : 0,
    done: remainingMs === 0,
    clock: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
  }
}
