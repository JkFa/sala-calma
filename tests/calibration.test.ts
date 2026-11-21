import { describe, expect, it } from 'vitest'
import { applyOffset, computeOffset, makeCalibration, MARGINS } from '../src/lib/calibration'
import { UNCALIBRATED_OFFSET } from '../src/config'

describe('calibração', () => {
  it('offset = referência − medido', () => {
    expect(computeOffset(-47.6, 58.0)).toBeCloseTo(105.6, 6)
  })
  it('aplica o offset', () => {
    const cal = makeCalibration(-47.6, 58, 'medidor', new Date('2026-03-02T10:00:00Z'))
    expect(applyOffset(-40, cal)).toBeCloseTo(65.6, 6)
    expect(cal.margin).toBe(MARGINS.medidor)
    expect(cal.date).toBe('2026-03-02T10:00:00.000Z')
  })
  it('sem calibração usa o offset genérico', () => {
    expect(applyOffset(-40, null)).toBe(-40 + UNCALIBRATED_OFFSET)
  })
  it('recusa valores de referência absurdos', () => {
    expect(() => computeOffset(-40, 5)).toThrow()
    expect(() => computeOffset(NaN, 60)).toThrow()
  })
})

describe('calibração feita com microfone mudo', () => {
  it('marca como suspeita quando o silêncio digital virou 35 dB(A)', async () => {
    const { calibracaoSuspeita, makeCalibration, QUIET_ROOM_DBA } = await import('../src/lib/calibration')
    expect(calibracaoSuspeita(makeCalibration(-120, QUIET_ROOM_DBA, 'sala-silenciosa'))).toBe(true)
    expect(calibracaoSuspeita(makeCalibration(-70, QUIET_ROOM_DBA, 'sala-silenciosa'))).toBe(false)
    expect(calibracaoSuspeita(null)).toBe(false)
  })
})
