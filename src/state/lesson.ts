/**
 * Controle da aula em andamento: liga o medidor à sessão, salva de tempos
 * em tempos, mantém a tela ligada e registra lacunas.
 */
import { WINDOW_MS } from '../config'
import { Meter, MeterError, type LevelEvent } from '../audio/meter'
import { applyOffset } from '../lib/calibration'
import { saveSession, unfinishedSession } from '../lib/db'
import {
  bandOf,
  finalize,
  newSession,
  openSegment,
  pushLevel,
  type Band,
  type GapReason,
  type Segment,
  type Session,
  computeReport,
} from '../lib/session'
import { settings } from './settings'
import { activityAt, addMark, type ActivityId, type ActivityKey } from '../lib/activities'
import { percentile } from '../lib/levels'
import { VocalStreak } from '../lib/vocalbreak'
import { createStore } from './store'

export type Status = 'parado' | 'iniciando' | 'medindo' | 'pausado' | 'interrompido'

export interface LessonState {
  status: Status
  session: Session | null
  /** Nível com média de ~1 s (dB(A) ou relativo). */
  level: number | null
  /** Nível com média de ~3 s, para o semáforo. */
  slow: number | null
  band: Band | null
  /** Banda do semáforo (com histerese). */
  lightBand: Band | null
  error: MeterError | null
  wakeLock: 'ativo' | 'indisponivel' | 'inativo'
  bateriaBaixa: boolean
  /** Sessão não encerrada encontrada ao abrir o app. */
  pendente: Session | null
  /** Últimos ~10 min (1 ponto/s, Leq de 1 s) para o gráfico ao vivo. */
  recent: number[]
  /** Últimos 30 s, uma leitura por janela de 125 ms, para o gráfico ao vivo. */
  wave: number[]
  /** Nível equivalente (Leq) da aula até agora. */
  leqAula: number | null
  /** Momento da aula em vigor (marcado pelo professor). */
  activity: ActivityKey
  /** Tempo seguido com o ruído de fundo acima do limiar de esforço vocal. */
  vocalStreakMs: number
  /** Lembrete de pausa vocal visível. */
  pausaVocal: boolean
  /** Qual dica mostrar no lembrete. */
  pausaDica: number
  /** Tempo na faixa calma nesta aula (mesma regra do relatório). */
  calmMs: number
}

export const lesson = createStore<LessonState>({
  status: 'parado',
  session: null,
  level: null,
  slow: null,
  band: null,
  lightBand: null,
  error: null,
  wakeLock: 'inativo',
  bateriaBaixa: false,
  pendente: null,
  recent: [],
  wave: [],
  leqAula: null,
  activity: 'sem-marcacao',
  vocalStreakMs: 0,
  pausaVocal: false,
  pausaDica: 0,
  calmMs: 0,
})

const meter = new Meter()
let seg: Segment | null = null
let nextReason: GapReason | null = null
let lastLevelAt = 0
let emaFast = 0
let emaSlow = 0
let secAcc: number[] = []
// Soma de energia da aula, para o Leq ao vivo.
let leqE = 0
let leqN = 0
/** Quantos pontos guardar para o gráfico ao vivo. */
export const RECENT_MAX = 600
export const WAVE_MAX = Math.round(30_000 / WINDOW_MS)
let saveTimer: number | null = null
let watchdog: number | null = null
let wakeLock: WakeLockSentinel | null = null
// Ruído de fundo ao vivo: L90 das últimas 10 s (80 janelas), por trecho.
let bgBuf: number[] = []
let streak: VocalStreak | null = null

function newStreak(s: Session) {
  streak = new VocalStreak({ threshold: s.thresholds.esforcoVocal, alertAfterMs: settings.get().lembreteVocalMin * 60_000 })
  bgBuf = []
}

const HYST = 1.5

function onLevel(e: LevelEvent) {
  const st = lesson.get()
  const s = st.session
  if (!s || (st.status !== 'medindo' && st.status !== 'interrompido')) return

  const gapSince = lastLevelAt ? e.t - lastLevelAt : 0
  lastLevelAt = e.t
  if (!seg || nextReason || gapSince > 1000) {
    const reason: GapReason = nextReason ?? (document.hidden ? 'segundo-plano' : 'interrompido')
    if (seg && streak) streak.gap(Math.max(0, e.t - (seg.start + seg.levels.length * s.windowMs)))
    bgBuf = []
    seg = openSegment(s, e.t, reason)
    nextReason = null
    emaFast = emaSlow = 0
  }
  pushLevel(seg, e.dbfsA)

  const lv = applyOffset(e.dbfsA, s.calibration)
  bgBuf.push(lv)
  if (bgBuf.length > 10_000 / WINDOW_MS) bgBuf.shift()
  let pausa: Partial<LessonState> = {}
  if (streak) {
    if (streak.update(percentile(bgBuf, 10), WINDOW_MS)) {
      s.lembretes = [...(s.lembretes ?? []), e.t]
      pausa = { pausaVocal: true, pausaDica: (st.pausaDica + 1) % 4 }
      void saveSession(s)
    }
    pausa.vocalStreakMs = streak.streakMs
  }
  const energy = Math.pow(10, lv / 10)
  leqE += energy
  leqN++
  const aF = 1 - Math.exp(-WINDOW_MS / 1000)
  const aS = 1 - Math.exp(-WINDOW_MS / 3000)
  emaFast = emaFast ? emaFast + aF * (energy - emaFast) : energy
  emaSlow = emaSlow ? emaSlow + aS * (energy - emaSlow) : energy
  const level = 10 * Math.log10(emaFast)
  const slow = 10 * Math.log10(emaSlow)

  const t = s.thresholds
  let lightBand = st.lightBand ?? bandOf(slow, t)
  // Histerese: só muda de faixa quando passa do limiar com folga.
  const raw = bandOf(slow, t)
  if (raw !== lightBand) {
    const up = { ...t, calmoAte: t.calmoAte + HYST, altoDesde: t.altoDesde + HYST }
    const down = { ...t, calmoAte: t.calmoAte - HYST, altoDesde: t.altoDesde - HYST }
    const order: Band[] = ['calmo', 'atencao', 'alto']
    const goingUp = order.indexOf(raw) > order.indexOf(lightBand)
    lightBand = bandOf(slow, goingUp ? up : down) === lightBand ? lightBand : raw
  }

  secAcc.push(lv)
  let recent = st.recent
  if (secAcc.length >= 1000 / WINDOW_MS) {
    const e2 = secAcc.reduce((a, v) => a + Math.pow(10, v / 10), 0) / secAcc.length
    recent = [...recent.slice(-(RECENT_MAX - 1)), 10 * Math.log10(e2)]
    secAcc = []
  }

  lesson.set({
    status: 'medindo',
    level,
    slow,
    band: bandOf(level, t),
    lightBand,
    recent,
    wave: [...st.wave.slice(-(WAVE_MAX - 1)), lv],
    leqAula: 10 * Math.log10(leqE / leqN),
    error: null,
    calmMs: st.calmMs + (bandOf(lv, t) === 'calmo' ? WINDOW_MS : 0),
    ...pausa,
  })
}

/** O professor viu o lembrete. */
export function dismissVocalBreak() {
  lesson.set({ pausaVocal: false })
}

meter.onLevel = onLevel
meter.onInterrupt = () => {
  if (lesson.get().status === 'medindo') {
    lesson.set({ status: 'interrompido' })
    void tryResume()
  }
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    lesson.set({ wakeLock: 'indisponivel' })
    return
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen')
    lesson.set({ wakeLock: 'ativo' })
    wakeLock.addEventListener('release', () => {
      wakeLock = null
      lesson.set({ wakeLock: 'inativo' })
    })
  } catch {
    lesson.set({ wakeLock: 'indisponivel' })
  }
}

async function checkBattery() {
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void }>
  }
  if (!nav.getBattery) return
  try {
    const b = await nav.getBattery()
    const upd = () => lesson.set({ bateriaBaixa: b.level <= 0.2 && !b.charging })
    upd()
    b.addEventListener('levelchange', upd)
    b.addEventListener('chargingchange', upd)
  } catch {
    /* sem API de bateria */
  }
}

function startTimers() {
  stopTimers()
  saveTimer = window.setInterval(() => {
    const s = lesson.get().session
    if (s) void saveSession(s)
  }, 15_000)
  // Retomada automática: se o medidor ficar mudo por 2 s, tenta religar.
  watchdog = window.setInterval(() => {
    const st = lesson.get()
    if (st.status === 'medindo' && Date.now() - lastLevelAt > 2000) {
      lesson.set({ status: 'interrompido' })
      void tryResume()
    }
  }, 1000)
}

function stopTimers() {
  if (saveTimer !== null) clearInterval(saveTimer)
  if (watchdog !== null) clearInterval(watchdog)
  saveTimer = watchdog = null
}

let resuming = false
async function tryResume() {
  if (resuming || document.hidden) return
  resuming = true
  try {
    meter.stop()
    await meter.start()
    lastLevelAt = Date.now()
  } catch (e) {
    lesson.set({ error: e instanceof MeterError ? e : null })
  } finally {
    resuming = false
  }
}

document.addEventListener('visibilitychange', () => {
  const st = lesson.get()
  if (document.hidden) return
  if (st.status === 'medindo' || st.status === 'interrompido') {
    void requestWakeLock()
    if (Date.now() - lastLevelAt > 1500) {
      lesson.set({ status: 'interrompido' })
      void tryResume()
    }
  }
})

export async function startLesson(turma: string, disciplina: string) {
  const st = settings.get()
  const s = newSession({ turma, disciplina, calibration: st.calibration, thresholds: st.thresholds })
  settings.set({ ultimaTurma: turma, ultimaDisciplina: disciplina })
  lesson.set({
    status: 'iniciando',
    session: s,
    error: null,
    recent: [],
    wave: [],
    leqAula: null,
    level: null,
    slow: null,
    lightBand: null,
    band: null,
    activity: 'sem-marcacao',
    vocalStreakMs: 0,
    pausaVocal: false,
    calmMs: 0,
  })
  newStreak(s)
  seg = null
  nextReason = null
  lastLevelAt = 0
  secAcc = []
  leqE = 0
  leqN = 0
  try {
    await meter.start()
  } catch (e) {
    lesson.set({ status: 'parado', session: null, error: e as MeterError })
    return false
  }
  lastLevelAt = Date.now()
  lesson.set({ status: 'medindo' })
  await saveSession(s)
  // Pede ao navegador para não apagar os dados sozinho (Chrome/Firefox/Safari).
  void navigator.storage?.persist?.().catch(() => {})
  startTimers()
  void requestWakeLock()
  void checkBattery()
  return true
}

export async function pauseLesson() {
  const s = lesson.get().session
  if (!s) return
  meter.stop()
  nextReason = 'pausa'
  lesson.set({ status: 'pausado', level: null, slow: null, band: null })
  await saveSession(s)
}

export async function resumeLesson() {
  if (!lesson.get().session) return
  lesson.set({ status: 'iniciando', error: null })
  try {
    await meter.start()
  } catch (e) {
    lesson.set({ status: 'pausado', error: e as MeterError })
    return
  }
  lastLevelAt = Date.now()
  lesson.set({ status: 'medindo' })
  void requestWakeLock()
}

export async function endLesson(): Promise<string | null> {
  const s = lesson.get().session
  meter.stop()
  stopTimers()
  await wakeLock?.release().catch(() => {})
  wakeLock = null
  if (!s) return null
  finalize(s, Date.now())
  await saveSession(s)
  lesson.set({ status: 'parado', session: null, level: null, slow: null, band: null, lightBand: null, recent: [], wave: [], leqAula: null, vocalStreakMs: 0, pausaVocal: false })
  streak = null
  return s.id
}

/** Ao abrir o app: procura aula que ficou aberta (app fechado no meio). */
export async function checkPending() {
  try {
    const p = await unfinishedSession()
    if (p && lesson.get().status === 'parado') lesson.set({ pendente: p })
  } catch {
    /* IndexedDB indisponível (navegação privada antiga) */
  }
}

/** Retoma a aula pendente: o tempo fora vira lacuna "interrompido". */
export async function continuePending() {
  const p = lesson.get().pendente
  if (!p) return
  p.marks ??= []
  const rep = computeReport(p)
  const n = Math.round(rep.measuredMs / p.windowMs)
  leqN = Number.isFinite(rep.leq) ? n : 0
  leqE = leqN ? Math.pow(10, rep.leq / 10) * n : 0
  lesson.set({ session: p, pendente: null, status: 'iniciando', recent: [], wave: [], leqAula: leqN ? rep.leq : null, activity: activityAt(p.marks, Date.now()), vocalStreakMs: 0, pausaVocal: false, calmMs: rep.bandMs.calmo })
  newStreak(p)
  seg = null
  nextReason = 'interrompido'
  try {
    await meter.start()
  } catch (e) {
    lesson.set({ status: 'pausado', error: e as MeterError })
    return
  }
  lastLevelAt = Date.now()
  lesson.set({ status: 'medindo' })
  startTimers()
  void requestWakeLock()
}

export async function closePending(): Promise<string | null> {
  const p = lesson.get().pendente
  if (!p) return null
  const last = p.segments[p.segments.length - 1]
  finalize(p, last ? last.start + last.levels.length * p.windowMs : p.startedAt)
  await saveSession(p)
  lesson.set({ pendente: null })
  return p.id
}

/**
 * Medição curta, sem aula (calibração, sala vazia). Devolve o dBFS(A) de
 * cada janela. `signal` permite cancelar.
 */
export async function measureWindows(
  seconds: number,
  onProgress: (fraction: number, dbfs: number) => void,
  signal?: AbortSignal,
): Promise<number[]> {
  if (lesson.get().session) throw new Error('Encerre a aula antes de fazer esta medição.')
  const m = new Meter()
  const values: number[] = []
  const total = Math.round((seconds * 1000) / WINDOW_MS)
  return new Promise<number[]>((resolve, reject) => {
    signal?.addEventListener('abort', () => {
      m.stop()
      reject(new DOMException('Cancelado', 'AbortError'))
    })
    m.onInterrupt = () => {
      m.stop()
      reject(new Error('O microfone parou no meio da medição (o app saiu da tela?). Tente de novo.'))
    }
    m.onLevel = (e) => {
      values.push(e.dbfsA)
      onProgress(values.length / total, e.dbfsA)
      if (values.length >= total) {
        m.stop()
        resolve(values)
      }
    }
    m.start().catch((e) => reject(e))
  })
}

/** Usado pela calibração: devolve o dBFS(A) médio (energético). */
export async function measureForCalibration(
  seconds: number,
  onProgress: (fraction: number, dbfs: number) => void,
): Promise<number> {
  const values = await measureWindows(seconds, onProgress)
  const energy = values.reduce((a, v) => a + Math.pow(10, v / 10), 0) / values.length
  return 10 * Math.log10(energy)
}

/** Marca o momento da aula (explicação, grupo…) a partir de agora. */
export function markActivity(kind: ActivityId) {
  const s = lesson.get().session
  if (!s) return
  s.marks = addMark(s.marks ?? [], kind, Date.now())
  lesson.set({ activity: activityAt(s.marks, Date.now()) })
  void saveSession(s)
}
