/**
 * Procura um microfone que esteja ouvindo a sala. Em computadores, o
 * sistema às vezes usa a entrada de fone de ouvido sem fone ligado: só
 * chega chiado constante. Testa cada entrada por alguns segundos (só o
 * nível, nada é gravado) e devolve a que tem variação de som real.
 */
import { listMics, Meter, SILENCE_DBFS, type MicInfo } from './meter'

const PROBE_MS = 4000
/** Alguns microfones mandam zeros no primeiro segundo ao ligar. */
const WARMUP_MS = 1500

export interface ProbeResult extends MicInfo {
  swing: number
  mean: number
}

export async function probeMic(mic: MicInfo, ms = PROBE_MS): Promise<ProbeResult | null> {
  const m = new Meter()
  m.deviceOverride = mic.id
  const vals: number[] = []
  const t0 = Date.now()
  m.onLevel = (e) => {
    if (Date.now() - t0 > WARMUP_MS && e.dbfsZ > SILENCE_DBFS) vals.push(e.dbfsA)
  }
  try {
    await m.start()
  } catch {
    return null
  }
  await new Promise((r) => setTimeout(r, ms))
  m.stop()
  return { ...mic, ...summarize(vals) }
}


/** Resumo de uma série de leituras (dBFS ponderado A, janelas de 125 ms). */
export function summarize(dbfs: number[]): { swing: number; mean: number } {
  if (dbfs.length < 4) return { swing: 0, mean: -120 }
  const sorted = [...dbfs].sort((a, b) => a - b)
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  const mean = 10 * Math.log10(dbfs.reduce((a, v) => a + Math.pow(10, v / 10), 0) / dbfs.length)
  return { swing: p(0.95) - p(0.05), mean }
}

/**
 * Testa os outros microfones ao mesmo tempo e devolve um que ouça a sala
 * claramente melhor que o atual, ou null. Melhor = varia pelo menos 2 dB
 * a mais, ou capta 10 dB a mais de som (e varia um pouco mais). Comparar com o atual (em vez de
 * um limite fixo) funciona também com a sala em silêncio, quando até um
 * microfone bom varia pouco.
 * `current`: leituras recentes do microfone em uso (dBFS A).
 */
export async function findWorkingMic(currentLabel: string, current: number[]): Promise<ProbeResult | null> {
  const others = (await listMics()).filter((m) => m.label !== currentLabel && !/monitor/i.test(m.label))
  if (!others.length) return null
  const base = summarize(current)
  const res = await Promise.all(others.map((m) => probeMic(m)))
  console.debug('[Sala Calma] microfones', { atual: currentLabel, ...base }, res)
  let best: ProbeResult | null = null
  for (const r of res) {
    if (!r) continue
    // Chiado de entrada sem nada ligado: ~0,5 dB de variação. Um microfone
    // de verdade numa sala silenciosa varia mais e capta bem mais som.
    // Precisa captar pelo menos o mesmo som que o atual: uma entrada que só
    // "varia" por estar ligando (transiente) não conta.
    const better =
      (r.swing >= base.swing + 2 && r.mean >= base.mean - 3) || (r.mean >= base.mean + 10 && r.swing >= base.swing + 0.5)
    if (better && (!best || r.mean > best.mean)) best = r
  }
  return best
}
