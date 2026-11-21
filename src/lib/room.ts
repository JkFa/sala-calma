/**
 * Medição da sala vazia: ruído de fundo do ambiente (ventilador, pátio,
 * trânsito), sem a turma. Compara com a recomendação da OMS para sala de
 * aula (35 dB LAeq). Só números; nada de áudio.
 */
import type { Calibration } from './calibration'
import { applyOffset } from './calibration'
import { leq, l10, l90, max } from './levels'

export const OMS_SALA_DBA = 35

export const CONDICOES = [
  { id: 'janelas-abertas', label: 'Janelas abertas' },
  { id: 'porta-aberta', label: 'Porta aberta' },
  { id: 'ventilador', label: 'Ventilador ligado' },
  { id: 'ar-condicionado', label: 'Ar-condicionado ligado' },
  { id: 'aula-ao-lado', label: 'Aula acontecendo nas salas vizinhas' },
  { id: 'recreio', label: 'Recreio ou educação física lá fora' },
] as const

export type CondicaoId = (typeof CONDICOES)[number]['id']

export interface RoomMeasurement {
  id: string
  sala: string
  createdAt: number
  durationS: number
  calibration: Calibration | null
  condicoes: CondicaoId[]
  /** dB(A) se calibrado; relativo se não. */
  leq: number
  l10: number
  l90: number
  max: number
  /** Leq de cada segundo, para o gráfico. */
  serie: number[]
}

export function makeRoomMeasurement(init: {
  sala: string
  dbfs: number[]
  windowMs: number
  calibration: Calibration | null
  condicoes: CondicaoId[]
  now?: number
}): RoomMeasurement {
  const now = init.now ?? Date.now()
  const lv = init.dbfs.map((v) => applyOffset(v, init.calibration))
  const per = Math.max(1, Math.round(1000 / init.windowMs))
  const serie: number[] = []
  for (let i = 0; i < lv.length; i += per) serie.push(Math.round(leq(lv.slice(i, i + per)) * 10) / 10)
  const r1 = (n: number) => Math.round(n * 10) / 10
  return {
    id: `sala-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    sala: init.sala.trim(),
    createdAt: now,
    durationS: Math.round((lv.length * init.windowMs) / 1000),
    calibration: init.calibration,
    condicoes: [...init.condicoes],
    leq: r1(leq(lv)),
    l10: r1(l10(lv)),
    l90: r1(l90(lv)),
    max: r1(max(lv)),
    serie,
  }
}

export type RoomVerdict = 'sem-calibracao' | 'dentro' | 'na-margem' | 'acima' | 'bem-acima'

/**
 * Compara o Leq com os 35 dB(A) da OMS, levando a margem de erro a sério:
 * se a diferença cabe na margem, não afirma nada.
 */
export function roomVerdict(m: Pick<RoomMeasurement, 'leq' | 'calibration'>): RoomVerdict {
  if (!m.calibration) return 'sem-calibracao'
  const diff = m.leq - OMS_SALA_DBA
  if (Math.abs(diff) <= m.calibration.margin) return 'na-margem'
  if (diff < 0) return 'dentro'
  if (diff <= 10) return 'acima'
  return 'bem-acima'
}

/**
 * Ruído intermitente (pátio, buzinas, portas) aparece como diferença
 * grande entre L10 e L90. Ruído constante (ventilador, ar) tem diferença
 * pequena. Diferença não depende de calibração.
 */
export function noiseCharacter(m: Pick<RoomMeasurement, 'l10' | 'l90'>): 'constante' | 'intermitente' {
  return m.l10 - m.l90 >= 8 ? 'intermitente' : 'constante'
}

export const ROOM_FORMAT = 'sala-calma/sala-vazia'

export interface ExportedRoom {
  formato: typeof ROOM_FORMAT
  versao: 1
  sala: string
  data: string
  duracaoS: number
  calibrado: boolean
  margemDb: number | null
  condicoes: CondicaoId[]
  leq: number
  l10: number
  l90: number
  max: number
  serie: number[]
}

export function roomToExport(m: RoomMeasurement): ExportedRoom {
  return {
    formato: ROOM_FORMAT,
    versao: 1,
    sala: m.sala,
    data: new Date(m.createdAt).toISOString(),
    duracaoS: m.durationS,
    calibrado: m.calibration !== null,
    margemDb: m.calibration?.margin ?? null,
    condicoes: m.condicoes,
    leq: m.leq,
    l10: m.l10,
    l90: m.l90,
    max: m.max,
    serie: m.serie,
  }
}

export function isExportedRoom(x: unknown): x is ExportedRoom {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return o.formato === ROOM_FORMAT && typeof o.leq === 'number' && typeof o.data === 'string'
}

/** Veredito para medições importadas (painel da escola). */
export function exportedVerdict(r: ExportedRoom): RoomVerdict {
  return roomVerdict({
    leq: r.leq,
    calibration: r.calibrado ? ({ margin: r.margemDb ?? 3 } as Calibration) : null,
  })
}
