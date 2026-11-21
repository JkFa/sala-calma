import { describe, expect, it } from 'vitest'
import { exportedVerdict, isExportedRoom, makeRoomMeasurement, noiseCharacter, roomToExport, roomVerdict } from '../src/lib/room'

const cal = (margin = 3) => ({ offset: 100, method: 'medidor' as const, margin, date: '', device: '' })

describe('medição da sala vazia', () => {
  const dbfs = Array.from({ length: 480 }, (_, i) => (i % 40 === 0 ? -50 : -62)) // 38 dB com picos a 50
  const m = makeRoomMeasurement({ sala: ' Sala 12 ', dbfs, windowMs: 125, calibration: cal(), condicoes: ['ventilador'], now: 1e12 })
  it('resume em dB(A) e série por segundo', () => {
    expect(m.sala).toBe('Sala 12')
    expect(m.durationS).toBe(60)
    expect(m.l90).toBe(38)
    expect(m.max).toBe(50)
    expect(m.serie).toHaveLength(60)
    expect(m.leq).toBeGreaterThan(38)
  })
  it('exporta e reconhece o formato', () => {
    const e = roomToExport(m)
    expect(isExportedRoom(e)).toBe(true)
    expect(isExportedRoom({ formato: 'sala-calma/aula' })).toBe(false)
    expect(e.calibrado).toBe(true)
    expect(e.condicoes).toEqual(['ventilador'])
  })
})

describe('comparação com a OMS (35 dB(A))', () => {
  const v = (leq: number, margin: number | null = 3) => roomVerdict({ leq, calibration: margin === null ? null : cal(margin) })
  it('sem calibração não compara', () => expect(v(30, null)).toBe('sem-calibracao'))
  it('dentro da margem não afirma', () => {
    expect(v(37.5)).toBe('na-margem')
    expect(v(32)).toBe('na-margem')
  })
  it('abaixo com folga', () => expect(v(30)).toBe('dentro'))
  it('acima', () => expect(v(41)).toBe('acima'))
  it('bem acima', () => expect(v(46)).toBe('bem-acima'))
  it('margem larga (sala silenciosa, ±8) quase nunca afirma', () => expect(v(42, 8)).toBe('na-margem'))
  it('veredito de arquivo importado', () => {
    expect(exportedVerdict({ leq: 44, calibrado: true, margemDb: 3 } as never)).toBe('acima')
    expect(exportedVerdict({ leq: 44, calibrado: false, margemDb: null } as never)).toBe('sem-calibracao')
  })
})

describe('tipo de ruído', () => {
  it('constante (ventilador) x intermitente (pátio)', () => {
    expect(noiseCharacter({ l10: 42, l90: 40 })).toBe('constante')
    expect(noiseCharacter({ l10: 52, l90: 40 })).toBe('intermitente')
  })
})
