/**
 * Exportação de uma aula: CSV (planilha) e JSON (para o painel da escola).
 * Só números agregados por segundo. Nenhum áudio.
 */
import type { Report, Session, Thresholds, Band } from './session'
import { bandOf, computeReport, perSecond } from './session'

export const EXPORT_FORMAT = 'sala-calma/aula'
export const EXPORT_VERSION = 1

export interface ExportedLesson {
  formato: typeof EXPORT_FORMAT
  versao: number
  turma: string
  disciplina: string
  inicio: string
  fim: string | null
  calibrado: boolean
  margemDb: number | null
  limiares: Thresholds
  resumo: {
    leq: number
    l10: number
    l90: number
    max: number
    minutosMedidos: number
    minutosSemMedicao: number
    minutosPorFaixa: Record<Band, number>
    minutosEsforcoVocal: number
  }
  /** [segundos desde o início, nível] — null = lacuna. */
  serie: [number, number | null][]
}

const r1 = (n: number) => Math.round(n * 10) / 10
const min = (ms: number) => r1(ms / 60000)

export function toExport(session: Session, report: Report = computeReport(session)): ExportedLesson {
  return {
    formato: EXPORT_FORMAT,
    versao: EXPORT_VERSION,
    turma: session.turma,
    disciplina: session.disciplina,
    inicio: new Date(session.startedAt).toISOString(),
    fim: session.endedAt ? new Date(session.endedAt).toISOString() : null,
    calibrado: report.calibrated,
    margemDb: report.margin,
    limiares: { ...session.thresholds },
    resumo: {
      leq: r1(report.leq),
      l10: r1(report.l10),
      l90: r1(report.l90),
      max: r1(report.max),
      minutosMedidos: min(report.measuredMs),
      minutosSemMedicao: min(report.gapMs),
      minutosPorFaixa: {
        calmo: min(report.bandMs.calmo),
        atencao: min(report.bandMs.atencao),
        alto: min(report.bandMs.alto),
      },
      minutosEsforcoVocal: min(report.vocalMs),
    },
    serie: perSecond(session).map((p) => [
      Math.round((p.t - session.startedAt) / 1000),
      p.v,
    ]),
  }
}

const BAND_LABEL: Record<Band, string> = { calmo: 'calmo', atencao: 'atencao', alto: 'alto' }

export function toCSV(session: Session): string {
  const unit = session.calibration ? 'nivel_dBA' : 'nivel_relativo'
  const rows = [`horario;${unit};faixa`]
  for (const p of perSecond(session)) {
    const t = new Date(p.t).toISOString()
    if (p.v === null) rows.push(`${t};;sem_medicao`)
    else rows.push(`${t};${p.v.toFixed(1).replace('.', ',')};${BAND_LABEL[bandOf(p.v, session.thresholds)]}`)
  }
  return rows.join('\r\n') + '\r\n'
}

export function isExportedLesson(x: unknown): x is ExportedLesson {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    o.formato === EXPORT_FORMAT &&
    typeof o.versao === 'number' &&
    typeof o.inicio === 'string' &&
    !!o.resumo &&
    Array.isArray(o.serie)
  )
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function fileBase(session: Session): string {
  const d = new Date(session.startedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}h${pad(d.getMinutes())}`
  const slug = [session.turma, session.disciplina]
    .filter(Boolean)
    .join('-')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return `aula_${stamp}${slug ? '_' + slug : ''}`
}
