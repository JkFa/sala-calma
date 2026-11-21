/**
 * Evolução ao longo do tempo: agrega as aulas salvas no aparelho por
 * semana (segunda a domingo) e por turma. Só usa o que já está guardado.
 */
import { computeReport, type Report, type Session } from './session'

export interface LessonSummary {
  id: string
  turma: string
  startedAt: number
  calibrated: boolean
  measuredMs: number
  leq: number
  altoMs: number
  vocalMs: number
}

export function summarizeSession(s: Session, r: Report = computeReport(s)): LessonSummary {
  return {
    id: s.id,
    turma: s.turma.trim() || '(sem turma)',
    startedAt: s.startedAt,
    calibrated: r.calibrated,
    measuredMs: r.measuredMs,
    leq: r.leq,
    altoMs: r.bandMs.alto,
    vocalMs: r.vocalMs,
  }
}

/** Início (00:00 local) da segunda-feira da semana de `t`. */
export function weekStart(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7 // segunda = 0
  d.setDate(d.getDate() - dow)
  return d.getTime()
}

export interface Bucket {
  /** Início do período (epoch ms). */
  start: number
  aulas: number
  measuredMs: number
  altoMs: number
  vocalMs: number
  /** % do tempo medido na faixa alta (NaN sem medição). */
  pctAlto: number
  /** Leq energético só das aulas calibradas; null se nenhuma. */
  leq: number | null
  /** Todas as aulas do período eram calibradas. */
  allCalibrated: boolean
}

function bucketOf(start: number, ls: LessonSummary[]): Bucket {
  let measured = 0
  let alto = 0
  let vocal = 0
  let e = 0
  let calMs = 0
  for (const l of ls) {
    measured += l.measuredMs
    alto += l.altoMs
    vocal += l.vocalMs
    if (l.calibrated && l.measuredMs > 0 && Number.isFinite(l.leq)) {
      e += Math.pow(10, l.leq / 10) * l.measuredMs
      calMs += l.measuredMs
    }
  }
  return {
    start,
    aulas: ls.length,
    measuredMs: measured,
    altoMs: alto,
    vocalMs: vocal,
    pctAlto: measured ? (alto / measured) * 100 : NaN,
    leq: calMs ? 10 * Math.log10(e / calMs) : null,
    allCalibrated: ls.length > 0 && ls.every((l) => l.calibrated),
  }
}

/**
 * As últimas `n` semanas até a semana de `now` (inclusive), em ordem
 * cronológica. Semanas sem aula aparecem vazias, para o gráfico não
 * esconder intervalos.
 */
export function weeklyBuckets(lessons: LessonSummary[], n: number, now = Date.now()): Bucket[] {
  const last = weekStart(now)
  const starts: number[] = []
  const d = new Date(last)
  for (let i = 0; i < n; i++) {
    starts.unshift(d.getTime())
    d.setDate(d.getDate() - 7)
  }
  return starts.map((s) => bucketOf(s, lessons.filter((l) => weekStart(l.startedAt) === s)))
}

export interface TurmaTrend {
  turma: string
  aulas: number
  /** % alto de cada aula, em ordem cronológica. */
  serie: number[]
  pctAlto: number
  vocalPorHora: number
  /** Diferença (pontos percentuais) entre a metade recente e a antiga; null com menos de 4 aulas. */
  tendencia: number | null
}

export function turmaTrends(lessons: LessonSummary[]): TurmaTrend[] {
  const by = new Map<string, LessonSummary[]>()
  for (const l of lessons) {
    if (l.measuredMs <= 0) continue
    by.set(l.turma, [...(by.get(l.turma) ?? []), l])
  }
  return [...by.entries()]
    .map(([turma, ls]) => {
      ls.sort((a, b) => a.startedAt - b.startedAt)
      const serie = ls.map((l) => (l.altoMs / l.measuredMs) * 100)
      const measured = ls.reduce((a, l) => a + l.measuredMs, 0)
      const alto = ls.reduce((a, l) => a + l.altoMs, 0)
      const vocal = ls.reduce((a, l) => a + l.vocalMs, 0)
      let tendencia: number | null = null
      if (ls.length >= 4) {
        const half = Math.floor(ls.length / 2)
        const pct = (xs: LessonSummary[]) =>
          (xs.reduce((a, l) => a + l.altoMs, 0) / xs.reduce((a, l) => a + l.measuredMs, 0)) * 100
        tendencia = pct(ls.slice(ls.length - half)) - pct(ls.slice(0, half))
      }
      return {
        turma,
        aulas: ls.length,
        serie,
        pctAlto: (alto / measured) * 100,
        vocalPorHora: (vocal / measured) * 60,
        tendencia,
      }
    })
    .sort((a, b) => b.pctAlto - a.pctAlto)
}

/** Texto da tendência: só afirma mudança acima de 5 pontos. */
export function trendLabel(t: number | null): string {
  if (t === null) return 'poucas aulas'
  if (t <= -5) return 'mais calma'
  if (t >= 5) return 'mais barulhenta'
  return 'estável'
}
