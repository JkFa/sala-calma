/**
 * Painel da escola: agrega arquivos JSON exportados pelos professores.
 * Sem backend. Os dados não identificam professores; turma e disciplina
 * vêm como o professor digitou.
 */
import type { ExportedLesson } from './exporting'

export interface Group {
  key: string
  aulas: number
  /** Leq energético ponderado pelo tempo medido. */
  leq: number
  minutos: number
  /** % do tempo medido na faixa alta. */
  pctAlto: number
  /** Minutos de esforço vocal por hora medida. */
  vocalPorHora: number
}

export const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

type KeyFn = (l: ExportedLesson) => string

export const byTurma: KeyFn = (l) => l.turma.trim() || '(sem turma)'
export const byWeekday: KeyFn = (l) => WEEKDAYS[new Date(l.inicio).getDay()]
export const byHour: KeyFn = (l) => `${String(new Date(l.inicio).getHours()).padStart(2, '0')}h`

/** Ordem cronológica para dia e horário. */
export const weekdayOrder = (a: Group, b: Group) =>
  ((WEEKDAYS.indexOf(a.key) + 6) % 7) - ((WEEKDAYS.indexOf(b.key) + 6) % 7)
export const keyOrder = (a: Group, b: Group) => a.key.localeCompare(b.key)

export function aggregate(lessons: ExportedLesson[], keyFn: KeyFn, order?: (a: Group, b: Group) => number): Group[] {
  const acc = new Map<string, { aulas: number; energy: number; min: number; alto: number; vocal: number }>()
  for (const l of lessons) {
    const m = l.resumo.minutosMedidos
    if (!(m > 0) || !Number.isFinite(l.resumo.leq)) continue
    const k = keyFn(l)
    const a = acc.get(k) ?? { aulas: 0, energy: 0, min: 0, alto: 0, vocal: 0 }
    a.aulas++
    a.energy += Math.pow(10, l.resumo.leq / 10) * m
    a.min += m
    a.alto += l.resumo.minutosPorFaixa.alto
    a.vocal += l.resumo.minutosEsforcoVocal
    acc.set(k, a)
  }
  return [...acc.entries()]
    .map(([key, a]) => ({
      key,
      aulas: a.aulas,
      leq: Math.round(10 * Math.log10(a.energy / a.min) * 10) / 10,
      minutos: Math.round(a.min),
      pctAlto: Math.round((a.alto / a.min) * 1000) / 10,
      vocalPorHora: Math.round((a.vocal / a.min) * 60 * 10) / 10,
    }))
    .sort(order ?? ((x, y) => y.leq - x.leq))
}

export interface SchoolSummary {
  aulas: number
  calibradas: number
  misto: boolean
  inicio: string | null
  fim: string | null
}

export function summarize(lessons: ExportedLesson[]): SchoolSummary {
  const cal = lessons.filter((l) => l.calibrado).length
  const dates = lessons.map((l) => l.inicio).sort()
  return {
    aulas: lessons.length,
    calibradas: cal,
    misto: cal > 0 && cal < lessons.length,
    inicio: dates[0] ?? null,
    fim: dates[dates.length - 1] ?? null,
  }
}

/** Remove duplicatas (mesmo início e turma), útil ao importar de novo. */
export function dedupe(lessons: ExportedLesson[]): ExportedLesson[] {
  const seen = new Set<string>()
  return lessons.filter((l) => {
    const k = `${l.inicio}|${l.turma}|${l.disciplina}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

import { ACTIVITIES, type ActivityId } from './activities'

export interface ActivityGroup {
  kind: ActivityId
  aulas: number
  minutos: number
  pctAlto: number
  vocalPorHora: number
}

/** Soma os momentos marcados de todas as aulas (só as que têm marcação). */
export function aggregateActivities(lessons: ExportedLesson[]): ActivityGroup[] {
  const acc = new Map<ActivityId, { aulas: number; min: number; alto: number; vocal: number }>()
  for (const l of lessons) {
    for (const a of ACTIVITIES) {
      const x = l.atividades?.[a.id]
      if (!x || !(x.minutos > 0)) continue
      const g = acc.get(a.id) ?? { aulas: 0, min: 0, alto: 0, vocal: 0 }
      g.aulas++
      g.min += x.minutos
      g.alto += x.minutosAlto
      g.vocal += x.minutosEsforcoVocal
      acc.set(a.id, g)
    }
  }
  return ACTIVITIES.filter((a) => acc.has(a.id)).map((a) => {
    const g = acc.get(a.id)!
    return {
      kind: a.id,
      aulas: g.aulas,
      minutos: Math.round(g.min),
      pctAlto: Math.round((g.alto / g.min) * 1000) / 10,
      vocalPorHora: Math.round((g.vocal / g.min) * 60 * 10) / 10,
    }
  })
}
