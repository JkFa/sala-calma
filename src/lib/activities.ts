/**
 * Momentos da aula: o professor marca o tipo de atividade enquanto mede.
 * Cada marcação vale do seu instante até a próxima (ou o fim da aula).
 * Permite ver qual atividade pesa mais no ruído.
 */
import { applyOffset } from './calibration'
import { leq, rollingL90 } from './levels'
import { bandOf, VOCAL_SPAN_MS, type Band, type Session } from './session'

export const ACTIVITIES = [
  { id: 'explicacao', label: 'Explicação', hint: 'você falando para a turma' },
  { id: 'exercicio', label: 'Exercício', hint: 'trabalho individual' },
  { id: 'grupo', label: 'Grupo', hint: 'trabalho em dupla ou grupo' },
  { id: 'prova', label: 'Prova', hint: 'avaliação, leitura silenciosa' },
  { id: 'transicao', label: 'Transição', hint: 'entrada, saída, troca de atividade' },
] as const

export type ActivityId = (typeof ACTIVITIES)[number]['id']
export type ActivityKey = ActivityId | 'sem-marcacao'

export const ACTIVITY_LABEL: Record<ActivityKey, string> = {
  ...(Object.fromEntries(ACTIVITIES.map((a) => [a.id, a.label])) as Record<ActivityId, string>),
  'sem-marcacao': 'Sem marcação',
}

export interface Mark {
  /** epoch ms */
  t: number
  kind: ActivityId
}

/** Janela para corrigir um toque errado sem criar trecho minúsculo. */
export const CORRECTION_MS = 10_000

/**
 * Adiciona uma marcação. Se a última foi há menos de 10 s, troca o tipo
 * dela (correção). Marcar o mesmo tipo em vigor não faz nada.
 */
export function addMark(marks: Mark[], kind: ActivityId, now: number): Mark[] {
  const last = marks[marks.length - 1]
  if (last && last.kind === kind) return marks
  if (last && now - last.t < CORRECTION_MS) {
    const prev = marks[marks.length - 2]
    // Se a correção volta ao tipo anterior, desfaz a marcação.
    if (prev && prev.kind === kind) return marks.slice(0, -1)
    return [...marks.slice(0, -1), { t: last.t, kind }]
  }
  return [...marks, { t: now, kind }]
}

/** Atividade em vigor no instante t. */
export function activityAt(marks: Mark[] | undefined, t: number): ActivityKey {
  let k: ActivityKey = 'sem-marcacao'
  for (const m of marks ?? []) {
    if (m.t <= t) k = m.kind
    else break
  }
  return k
}

export interface ActivityStats {
  kind: ActivityKey
  measuredMs: number
  leq: number
  bandMs: Record<Band, number>
  pctAlto: number
  vocalMs: number
}

/** Estatística por atividade, só sobre o tempo realmente medido. */
export function statsByActivity(session: Session): ActivityStats[] {
  const w = session.windowMs
  const span = Math.round(VOCAL_SPAN_MS / w)
  const marks = [...(session.marks ?? [])].sort((a, b) => a.t - b.t)
  const acc = new Map<ActivityKey, { lv: number[]; band: Record<Band, number>; vocal: number }>()
  for (const seg of session.segments) {
    const lv = seg.levels.map((v) => applyOffset(v, session.calibration))
    const bg = rollingL90(lv, span)
    let mi = 0
    let current: ActivityKey = 'sem-marcacao'
    for (let i = 0; i < lv.length; i++) {
      const t = seg.start + i * w
      while (mi < marks.length && marks[mi].t <= t) current = marks[mi++].kind
      const a = acc.get(current) ?? { lv: [], band: { calmo: 0, atencao: 0, alto: 0 }, vocal: 0 }
      a.lv.push(lv[i])
      a.band[bandOf(lv[i], session.thresholds)] += w
      if (bg[i] > session.thresholds.esforcoVocal) a.vocal += w
      acc.set(current, a)
    }
  }
  const order: ActivityKey[] = [...ACTIVITIES.map((a) => a.id), 'sem-marcacao']
  return order
    .filter((k) => acc.has(k))
    .map((k) => {
      const a = acc.get(k)!
      const measuredMs = a.lv.length * w
      return {
        kind: k,
        measuredMs,
        leq: leq(a.lv),
        bandMs: a.band,
        pctAlto: measuredMs ? (a.band.alto / measuredMs) * 100 : 0,
        vocalMs: a.vocal,
      }
    })
}

/**
 * Frase de destaque: a atividade marcada com mais tempo na faixa alta.
 * Ignora trechos curtos (< 2 min) e o tempo sem marcação.
 */
export function loudestActivity(stats: ActivityStats[]): ActivityStats | null {
  const c = stats.filter((s) => s.kind !== 'sem-marcacao' && s.measuredMs >= 120_000)
  if (c.length < 2) return null
  const best = [...c].sort((a, b) => b.pctAlto - a.pctAlto)[0]
  return best.pctAlto >= 10 ? best : null
}

/** Trechos contínuos para desenhar a faixa de atividades. */
export function activitySpans(marks: Mark[] | undefined, start: number, end: number) {
  const ms = [...(marks ?? [])].filter((m) => m.t < end).sort((a, b) => a.t - b.t)
  const spans: { kind: ActivityKey; a: number; b: number }[] = []
  let cur: ActivityKey = 'sem-marcacao'
  let from = start
  for (const m of ms) {
    const t = Math.max(start, m.t)
    if (t > from) spans.push({ kind: cur, a: from, b: t })
    cur = m.kind
    from = t
  }
  if (end > from) spans.push({ kind: cur, a: from, b: end })
  return spans
}
