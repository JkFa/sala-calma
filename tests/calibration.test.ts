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
