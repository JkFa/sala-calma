import { describe, expect, it } from 'vitest'
import { isExportedLesson, toCSV, toExport, fileBase } from '../src/lib/exporting'
import { aggregate, byTurma, byWeekday, dedupe, summarize, weekdayOrder } from '../src/lib/school'
import { finalize, newSession, openSegment, pushLevel } from '../src/lib/session'

const T = { calmoAte: 55, altoDesde: 65, esforcoVocal: 43 }
const cal = { offset: 100, method: 'medidor' as const, margin: 3, date: '2026-03-02T10:00:00Z', device: '' }

function lesson(turma: string, startIso: string, dbA: number, seconds: number) {
  const t0 = Date.parse(startIso)
  const s = newSession({ calibration: cal, thresholds: T, turma, disciplina: 'Ciências', now: t0 })
  const seg = openSegment(s, t0, 'pausa')
  for (let i = 0; i < seconds * 8; i++) pushLevel(seg, dbA - 100)
  finalize(s, t0 + seconds * 1000)
  return s
}

describe('exportação', () => {
  const s = lesson('7º B', '2026-03-03T13:10:00Z', 62.4, 120)
  it('JSON reconhecível e só com números', () => {
    const e = toExport(s)
    expect(isExportedLesson(e)).toBe(true)
    expect(e.resumo.leq).toBe(62.4)
    expect(e.resumo.minutosMedidos).toBe(2)
    expect(e.serie).toHaveLength(120)
    expect(e.serie.every(([t, v]) => typeof t === 'number' && typeof v === 'number')).toBe(true)
  })
  it('CSV com vírgula decimal e faixa', () => {
    const csv = toCSV(s).split('\r\n')
    expect(csv[0]).toBe("horario;nivel_dBA;faixa;momento")
    expect(csv[1]).toBe("2026-03-03T13:10:00.000Z;62,4;atencao;")
  })
  it('nome de arquivo sem acentos', () => {
    expect(fileBase(s)).toMatch(/^aula_2026-03-03_\d\dh10_7-b-ciencias$/)
  })
  it('recusa JSON de outro formato', () => {
    expect(isExportedLesson({ formato: 'outro' })).toBe(false)
  })
})

describe('painel da escola', () => {
  const ls = [
    toExport(lesson('6º A', '2026-03-02T13:00:00Z', 70, 600)),
    toExport(lesson('6º A', '2026-03-03T13:00:00Z', 60, 600)),
    toExport(lesson('9º C', '2026-03-03T15:00:00Z', 52, 300)),
  ]
  it('agrega por turma com média energética', () => {
    const g = aggregate(ls, byTurma)
    expect(g[0].key).toBe('6º A')
    expect(g[0].aulas).toBe(2)
    expect(g[0].leq).toBeCloseTo(67.4, 1)
    expect(g[0].pctAlto).toBe(50)
    expect(g[1]).toMatchObject({ key: '9º C', leq: 52, pctAlto: 0 })
  })
  it('agrega por dia da semana', () => {
    expect(aggregate(ls, byWeekday).map((g) => g.key).sort()).toEqual(['seg', 'ter'])
  })
  it('ordena dias da semana a partir de segunda', () => {
    expect(aggregate(ls, byWeekday, weekdayOrder).map((g) => g.key)).toEqual(['seg', 'ter'])
  })
  it('remove duplicatas e resume', () => {
    expect(dedupe([...ls, ls[0]])).toHaveLength(3)
    expect(summarize(ls)).toMatchObject({ aulas: 3, calibradas: 3, misto: false })
  })
})

import { addMark } from '../src/lib/activities'
import { aggregateActivities } from '../src/lib/school'

describe('momentos na exportação e na escola', () => {
  function marked(turma: string, iso: string) {
    const t0 = Date.parse(iso)
    const s = newSession({ calibration: cal, thresholds: T, turma, now: t0 })
    const seg = openSegment(s, t0, 'pausa')
    s.marks = addMark([], 'explicacao', t0)
    for (let i = 0; i < 600 * 8; i++) pushLevel(seg, 52 - 100) // 10 min explicação
    s.marks = addMark(s.marks, 'grupo', t0 + 600_000)
    for (let i = 0; i < 600 * 8; i++) pushLevel(seg, 70 - 100) // 10 min grupo
    finalize(s, t0 + 1_200_000)
    return s
  }
  it('JSON leva marcas e resumo por momento; CSV leva a coluna', () => {
    const s = marked('7º A', '2026-03-03T13:00:00Z')
    const e = toExport(s)
    expect(e.marcas).toEqual([[0, 'explicacao'], [600, 'grupo']])
    expect(e.atividades?.grupo).toMatchObject({ minutos: 10, minutosAlto: 10, leq: 70 })
    expect(e.atividades?.explicacao).toMatchObject({ minutos: 10, minutosAlto: 0 })
    const csv = toCSV(s).split('\r\n')
    expect(csv[1].endsWith(';explicacao')).toBe(true)
    expect(csv[700].endsWith(';grupo')).toBe(true)
  })
  it('aula sem marcação não leva campos novos (formato antigo)', () => {
    const e = toExport(lesson('8º', '2026-03-03T13:10:00Z', 60, 30))
    expect(e.marcas).toBeUndefined()
    expect(e.atividades).toBeUndefined()
  })
  it('escola agrega momentos de várias aulas', () => {
    const ls = [marked('7º A', '2026-03-03T13:00:00Z'), marked('8º B', '2026-03-04T13:00:00Z')].map((s) => toExport(s))
    const g = aggregateActivities([...ls, toExport(lesson('9º', '2026-03-05T13:00:00Z', 60, 30))])
    expect(g.map((x) => x.kind)).toEqual(['explicacao', 'grupo'])
    expect(g[1]).toMatchObject({ aulas: 2, minutos: 20, pctAlto: 100 })
    expect(g[0].pctAlto).toBe(0)
  })
})
