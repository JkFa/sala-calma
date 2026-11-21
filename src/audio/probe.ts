/**
 * Procura um microfone que esteja ouvindo a sala. Em computadores, o
 * sistema às vezes usa a entrada de fone de ouvido sem fone ligado: só
 * chega chiado constante. Testa cada entrada por alguns segundos (só o
 * nível, nada é gravado) e devolve a que tem variação de som real.
 */
import { listMics, Meter, SILENCE_DBFS, type MicInfo } from './meter'

const PROBE_MS = 3000
/** Alguns microfones mandam zeros no primeiro segundo ao ligar. */
const WARMUP_MS = 1000
/** Variação mínima (dB) para dizer que o microfone ouve a sala. */
export const LIVE_SWING_DB = 6

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
  if (vals.length < 4) return { ...mic, swing: 0, mean: -120 }
  const sorted = [...vals].sort((a, b) => a - b)
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  const mean = 10 * Math.log10(vals.reduce((a, v) => a + Math.pow(10, v / 10), 0) / vals.length)
  return { ...mic, swing: p(0.95) - p(0.05), mean }
}

/**
 * Testa os outros microfones e devolve o melhor que ouve a sala, ou null.
 * `skipLabel`: o microfone atual (já sabemos que não funciona).
 */
export async function findWorkingMic(skipLabel: string): Promise<ProbeResult | null> {
  const mics = (await listMics()).filter((m) => m.label !== skipLabel && !/monitor/i.test(m.label))
  let best: ProbeResult | null = null
  for (const mic of mics) {
    const r = await probeMic(mic)
    if (r && r.swing >= LIVE_SWING_DB && (!best || r.swing > best.swing)) best = r
  }
  return best
}
