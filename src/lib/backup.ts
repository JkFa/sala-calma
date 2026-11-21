/**
 * Backup e troca de aparelho: um arquivo com todas as aulas, salas vazias
 * e ajustes. Restaurar JUNTA com o que já existe (por id): nunca apaga nem
 * sobrescreve. Só números e textos curtos, como no resto do app.
 */
import type { Settings } from '../state/settings'
import type { Calibration } from './calibration'
import type { RoomMeasurement } from './room'
import type { Session } from './session'

export const BACKUP_FORMAT = 'sala-calma/backup'
export const BACKUP_VERSION = 1

/** Ajustes que fazem sentido levar para outro aparelho. */
export type PortableSettings = Pick<Settings, 'thresholds' | 'calibration' | 'theme' | 'mudo' | 'metaMinutos'>

export interface Backup {
  formato: typeof BACKUP_FORMAT
  versao: number
  criadoEm: string
  /** Aparelho de origem (user agent resumido), só para mostrar. */
  aparelho: string
  ajustes: PortableSettings
  aulas: Session[]
  salas: RoomMeasurement[]
}

export function makeBackup(
  sessions: Session[],
  rooms: RoomMeasurement[],
  settings: Settings,
  device = '',
  now = Date.now(),
): Backup {
  const { thresholds, calibration, theme, mudo, metaMinutos } = settings
  return {
    formato: BACKUP_FORMAT,
    versao: BACKUP_VERSION,
    criadoEm: new Date(now).toISOString(),
    aparelho: device,
    ajustes: { thresholds, calibration, theme, mudo, metaMinutos },
    aulas: sessions,
    salas: rooms,
  }
}

export function backupName(now = Date.now()): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `sala-calma_backup_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

// ---------- Validação ----------

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isStr = (x: unknown, max = 200): x is string => typeof x === 'string' && x.length <= max
const isNumArr = (x: unknown): x is number[] => Array.isArray(x) && x.every(isNum)

function validCalibration(c: unknown): c is Calibration {
  if (c === null) return true
  const o = c as Calibration
  return !!o && isNum(o.offset) && isNum(o.margin) && isStr(o.date) && (o.method === 'medidor' || o.method === 'sala-silenciosa')
}

function validThresholds(t: unknown): boolean {
  const o = t as Session['thresholds']
  return !!o && isNum(o.calmoAte) && isNum(o.altoDesde) && isNum(o.esforcoVocal) && o.calmoAte < o.altoDesde
}

export function validSession(x: unknown): x is Session {
  const s = x as Session
  return (
    !!s &&
    isStr(s.id, 80) &&
    isStr(s.turma) &&
    isStr(s.disciplina) &&
    isNum(s.startedAt) &&
    (s.endedAt === null || isNum(s.endedAt)) &&
    isNum(s.windowMs) &&
    s.windowMs > 0 &&
    validCalibration(s.calibration) &&
    validThresholds(s.thresholds) &&
    Array.isArray(s.segments) &&
    s.segments.every((g) => g && isNum(g.start) && isNumArr(g.levels)) &&
    Array.isArray(s.gaps) &&
    s.gaps.every((g) => g && isNum(g.start) && isNum(g.end) && isStr(g.reason, 30)) &&
    (s.marks === undefined || (Array.isArray(s.marks) && s.marks.every((m) => m && isNum(m.t) && isStr(m.kind, 30))))
  )
}

export function validRoom(x: unknown): x is RoomMeasurement {
  const m = x as RoomMeasurement
  return (
    !!m &&
    isStr(m.id, 80) &&
    isStr(m.sala) &&
    isNum(m.createdAt) &&
    isNum(m.durationS) &&
    validCalibration(m.calibration) &&
    Array.isArray(m.condicoes) &&
    m.condicoes.every((c) => isStr(c, 40)) &&
    isNum(m.leq) &&
    isNum(m.l10) &&
    isNum(m.l90) &&
    isNum(m.max) &&
    isNumArr(m.serie)
  )
}

export function isBackup(x: unknown): x is Backup {
  const o = x as Backup
  return !!o && o.formato === BACKUP_FORMAT && isNum(o.versao) && Array.isArray(o.aulas) && Array.isArray(o.salas) && !!o.ajustes
}

// ---------- Plano de restauração ----------

export interface RestorePlan {
  criadoEm: string
  aparelho: string
  /** Aulas a gravar (válidas e ainda não presentes). */
  novasAulas: Session[]
  aulasRepetidas: number
  novasSalas: RoomMeasurement[]
  salasRepetidas: number
  /** Itens descartados por estarem malformados. */
  invalidos: number
  ajustes: PortableSettings | null
  calibracao: Calibration | null
}

/** Fim de uma aula que ficou aberta no backup: fim do último trecho. */
function closeIfOpen(s: Session): Session {
  if (s.endedAt !== null) return s
  const last = s.segments[s.segments.length - 1]
  return { ...s, endedAt: last ? last.start + last.levels.length * s.windowMs : s.startedAt }
}

export function planRestore(b: Backup, existingSessionIds: Set<string>, existingRoomIds: Set<string>): RestorePlan {
  let invalidos = 0
  const novasAulas: Session[] = []
  let aulasRepetidas = 0
  const seenS = new Set<string>()
  for (const s of b.aulas) {
    if (!validSession(s)) {
      invalidos++
      continue
    }
    if (existingSessionIds.has(s.id) || seenS.has(s.id)) {
      aulasRepetidas++
      continue
    }
    seenS.add(s.id)
    novasAulas.push(closeIfOpen(s))
  }
  const novasSalas: RoomMeasurement[] = []
  let salasRepetidas = 0
  const seenR = new Set<string>()
  for (const m of b.salas) {
    if (!validRoom(m)) {
      invalidos++
      continue
    }
    if (existingRoomIds.has(m.id) || seenR.has(m.id)) {
      salasRepetidas++
      continue
    }
    seenR.add(m.id)
    novasSalas.push(m)
  }
  const a = b.ajustes
  const ajustesOk =
    a &&
    validThresholds(a.thresholds) &&
    isNum(a.metaMinutos) &&
    typeof a.mudo === 'boolean' &&
    ['auto', 'claro', 'escuro'].includes(a.theme)
  return {
    criadoEm: isStr(b.criadoEm) ? b.criadoEm : '',
    aparelho: isStr(b.aparelho) ? b.aparelho : '',
    novasAulas,
    aulasRepetidas,
    novasSalas,
    salasRepetidas,
    invalidos,
    ajustes: ajustesOk ? { thresholds: a.thresholds, theme: a.theme, mudo: a.mudo, metaMinutos: a.metaMinutos, calibration: null } : null,
    calibracao: a && a.calibration && validCalibration(a.calibration) ? a.calibration : null,
  }
}

/**
 * Ajustes resultantes. A calibração vale para o microfone do aparelho de
 * origem: só é aplicada se o professor pedir explicitamente.
 */
export function applySettings(
  current: Settings,
  plan: RestorePlan,
  opts: { ajustes: boolean; calibracao: boolean },
): Settings {
  let next = { ...current }
  if (opts.ajustes && plan.ajustes) {
    const { thresholds, theme, mudo, metaMinutos } = plan.ajustes
    next = { ...next, thresholds: { ...thresholds }, theme, mudo, metaMinutos }
  }
  if (opts.calibracao && plan.calibracao) next.calibration = { ...plan.calibracao }
  return next
}

/** Lembrete: muitas aulas e nenhum backup nos últimos 30 dias. */
export function needsBackupReminder(lessonCount: number, lastBackup: string | null, now = Date.now()): boolean {
  if (lessonCount < 5) return false
  if (!lastBackup) return true
  return now - Date.parse(lastBackup) > 30 * 24 * 3600 * 1000
}
