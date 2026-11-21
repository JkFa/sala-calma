/**
 * Modelo de sessão (uma aula) e cálculo do relatório.
 *
 * Uma sessão guarda SÓ números: níveis por janela de 125 ms, em dBFS
 * ponderado A, agrupados em trechos contínuos. Entre trechos há lacunas
 * explícitas (pausa, interrupção, app em segundo plano).
 */
import { WINDOW_MS } from '../config'
import type { Calibration } from './calibration'
import { applyOffset } from './calibration'
import { leq, l10, l90, max, rollingL90 } from './levels'
import type { Mark } from './activities'

export type GapReason = 'pausa' | 'interrompido' | 'segundo-plano' | 'permissao'

export interface Segment {
  /** Início do trecho (epoch ms). */
  start: number
  /** dBFS(A) por janela, arredondado a 0,1 dB. */
  levels: number[]
}

export interface Gap {
  start: number
  end: number
  reason: GapReason
}

export interface Thresholds {
  calmoAte: number
  altoDesde: number
  esforcoVocal: number
}

export interface Session {
  id: string
  turma: string
  disciplina: string
  startedAt: number
  endedAt: number | null
  windowMs: number
  calibration: Calibration | null
  thresholds: Thresholds
  segments: Segment[]
  gaps: Gap[]
  /** Momentos da aula marcados pelo professor (opcional; aulas antigas não têm). */
  marks?: Mark[]
  /** Instantes (epoch ms) em que o lembrete de pausa vocal apareceu. */
  lembretes?: number[]
}

export type Band = 'calmo' | 'atencao' | 'alto'

export function bandOf(level: number, t: Thresholds): Band {
  if (level >= t.altoDesde) return 'alto'
  if (level > t.calmoAte) return 'atencao'
  return 'calmo'
}

export function newSession(
  init: Partial<Pick<Session, 'turma' | 'disciplina'>> & {
    calibration: Calibration | null
    thresholds: Thresholds
    now?: number
  },
): Session {
  const now = init.now ?? Date.now()
  return {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    turma: init.turma?.trim() ?? '',
    disciplina: init.disciplina?.trim() ?? '',
    startedAt: now,
    endedAt: null,
    windowMs: WINDOW_MS,
    calibration: init.calibration,
    thresholds: { ...init.thresholds },
    segments: [],
    gaps: [],
    marks: [],
  }
}

/** Fim de um trecho (epoch ms). */
export function segmentEnd(s: Segment, windowMs: number): number {
  return s.start + s.levels.length * windowMs
}

/**
 * Abre um trecho novo. Se houver um trecho anterior, registra a lacuna
 * entre o fim dele e `now` (se maior que uma janela).
 */
export function openSegment(session: Session, now: number, reason: GapReason): Segment {
  const prev = session.segments[session.segments.length - 1]
  if (prev) {
    const end = segmentEnd(prev, session.windowMs)
    if (now - end > session.windowMs) {
      session.gaps.push({ start: end, end: now, reason })
    }
  }
  const seg: Segment = { start: now, levels: [] }
  session.segments.push(seg)
  return seg
}

export function pushLevel(seg: Segment, dbfs: number) {
  seg.levels.push(Math.round(dbfs * 10) / 10)
}

/** Remove trechos vazios (ex.: aula encerrada logo após retomar). */
export function finalize(session: Session, now: number) {
  session.segments = session.segments.filter((s) => s.levels.length > 0)
  session.endedAt = now
}

export interface Report {
  calibrated: boolean
  margin: number | null
  measuredMs: number
  gapMs: number
  totalMs: number
  leq: number
  l10: number
  l90: number
  max: number
  bandMs: Record<Band, number>
  /** Tempo com ruído de fundo (L90 móvel de 10 s) acima do limiar vocal. */
  vocalMs: number
  gapsByReason: Partial<Record<GapReason, number>>
}

/** Níveis em dB(A) (ou relativos) de todos os trechos, em ordem. */
export function allLevels(session: Session): number[] {
  const out: number[] = []
  for (const seg of session.segments) {
    for (const v of seg.levels) out.push(applyOffset(v, session.calibration))
  }
  return out
}

export const VOCAL_SPAN_MS = 10_000

export function computeReport(session: Session): Report {
  const w = session.windowMs
  const bandMs: Record<Band, number> = { calmo: 0, atencao: 0, alto: 0 }
  let vocalWindows = 0
  const all: number[] = []
  const span = Math.round(VOCAL_SPAN_MS / w)

  // O L90 móvel é calculado por trecho: não atravessa lacunas.
  for (const seg of session.segments) {
    const lv = seg.levels.map((v) => applyOffset(v, session.calibration))
    const bg = rollingL90(lv, span)
    for (let i = 0; i < lv.length; i++) {
      bandMs[bandOf(lv[i], session.thresholds)] += w
      if (bg[i] > session.thresholds.esforcoVocal) vocalWindows++
      all.push(lv[i])
    }
  }

  let gapMs = 0
  const gapsByReason: Partial<Record<GapReason, number>> = {}
  for (const g of session.gaps) {
    const d = g.end - g.start
    gapMs += d
    gapsByReason[g.reason] = (gapsByReason[g.reason] ?? 0) + d
  }
  const measuredMs = all.length * w
  return {
    calibrated: session.calibration !== null,
    margin: session.calibration?.margin ?? null,
    measuredMs,
    gapMs,
    totalMs: measuredMs + gapMs,
    leq: leq(all),
    l10: l10(all),
    l90: l90(all),
    max: max(all),
    bandMs,
    vocalMs: vocalWindows * w,
    gapsByReason,
  }
}

/**
 * Série de 1 em 1 segundo (Leq de cada segundo), com `null` nas lacunas.
 * Usada no gráfico e na exportação.
 */
export function perSecond(session: Session): { t: number; v: number | null }[] {
  const out: { t: number; v: number | null }[] = []
  const per = Math.max(1, Math.round(1000 / session.windowMs))
  for (let si = 0; si < session.segments.length; si++) {
    const seg = session.segments[si]
    if (si > 0) {
      const gap = session.gaps.find((g) => g.end === seg.start)
      if (gap) out.push({ t: gap.start, v: null })
    }
    for (let i = 0; i < seg.levels.length; i += per) {
      const chunk = seg.levels
        .slice(i, i + per)
        .map((v) => applyOffset(v, session.calibration))
      out.push({ t: seg.start + i * session.windowMs, v: Math.round(leq(chunk) * 10) / 10 })
    }
  }
  return out
}
