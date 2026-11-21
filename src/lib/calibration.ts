import { UNCALIBRATED_OFFSET } from '../config'

export type CalibrationMethod = 'medidor' | 'sala-silenciosa'

export interface Calibration {
  /** dB a somar ao dBFS(A) para obter dB(A). */
  offset: number
  method: CalibrationMethod
  /** Margem de erro estimada (±dB). */
  margin: number
  /** ISO 8601. */
  date: string
  /** Identificação do aparelho (user agent resumido), só para lembrar. */
  device: string
  /** Nome do microfone usado na calibração (calibrações antigas não têm). */
  mic?: string
}

/** Margens estimadas por método. */
export const MARGINS: Record<CalibrationMethod, number> = {
  // Medidor de referência de uso geral (classe 2 ~ ±1,5 dB) somado à
  // variação do microfone do aparelho entre frequências.
  medidor: 3,
  // Sala vazia e silenciosa assumida em torno de 35 dB(A): grosseiro.
  'sala-silenciosa': 8,
}

/** Nível assumido para o método "sala silenciosa" (OMS: 35 dB(A)). */
export const QUIET_ROOM_DBA = 35

/** Offset = referência − medido (dBFS ponderado A). */
export function computeOffset(measuredDbfs: number, referenceDbA: number): number {
  if (!Number.isFinite(measuredDbfs) || !Number.isFinite(referenceDbA)) {
    throw new Error('Medição inválida')
  }
  if (referenceDbA < 20 || referenceDbA > 130) {
    throw new Error('O valor de referência precisa estar entre 20 e 130 dB(A).')
  }
  return Math.round((referenceDbA - measuredDbfs) * 10) / 10
}

export function makeCalibration(
  measuredDbfs: number,
  referenceDbA: number,
  method: CalibrationMethod,
  now = new Date(),
  device = '',
): Calibration {
  return {
    offset: computeOffset(measuredDbfs, referenceDbA),
    method,
    margin: MARGINS[method],
    date: now.toISOString(),
    device,
  }
}

export function applyOffset(dbfs: number, cal: Calibration | null): number {
  return dbfs + (cal ? cal.offset : UNCALIBRATED_OFFSET)
}

/**
 * Ajuste acima disto só acontece se a calibração foi feita com o microfone
 * mudo (silêncio digital virou "35 dB(A)"). Microfones reais ficam bem abaixo.
 */
export const OFFSET_SUSPEITO = 135

export function calibracaoSuspeita(cal: Calibration | null): boolean {
  return cal !== null && cal.offset > OFFSET_SUSPEITO
}
