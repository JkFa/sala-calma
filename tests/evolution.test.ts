import { describe, expect, it } from 'vitest'
import { summarizeSession, trendLabel, turmaTrends, weekStart, weeklyBuckets, type LessonSummary } from '../src/lib/evolution'
import { finalize, newSession, openSegment, pushLevel } from '../src/lib/session'

const T = { calmoAte: 55, altoDesde: 65, esforcoVocal: 43 }
const cal = { offset: 100, method: 'medidor' as const, margin: 3, date: '', device: '' }

const L = (turma: string, iso: string, altoMin: number, measuredMin = 50, leq = 62, calibrated = true): LessonSummary => ({
  id: iso, turma, startedAt: new Date(iso).getTime(), calibrated,
  measuredMs: measuredMin * 60000, leq, altoMs: altoMin * 60000, vocalMs: 20 * 60000,
})

describe('semana', () => {
  it('começa na segunda-feira, 00:00', () => {
    const qua = new Date(2026, 2, 11, 15, 30).getTime() // quarta
    expect(new Date(weekStart(qua))).toEqual(new Date(2026, 2, 9, 0, 0))
    const dom = new Date(2026, 2, 15, 9).getTime() // domingo fica na semana anterior
    expect(new Date(weekStart(dom))).toEqual(new Date(2026, 2, 9, 0, 0))
  })
})

describe('semanas', () => {
  const now = new Date(2026, 2, 18, 12).getTime() // quarta, semana de 16/03
  const ls = [
    L('7º A', '2026-03-09T10:00:00', 10),
    L('7º A', '2026-03-11T10:00:00', 20, 50, 66),
    L('7º A', '2026-03-17T10:00:00', 5, 50, 58, false),
  ]
  const ws = weeklyBuckets(ls, 4, now)
  it('devolve n semanas em ordem, com vazias', () => {
    expect(ws).toHaveLength(4)
    expect(ws.map((w) => w.aulas)).toEqual([0, 0, 2, 1])
    expect(ws[0].pctAlto).toBeNaN()
  })
  it('soma tempos e calcula % alto', () => {
    expect(ws[2].altoMs).toBe(30 * 60000)
    expect(ws[2].pctAlto).toBeCloseTo(30, 6)
    expect(ws[2].vocalMs).toBe(40 * 60000)
  })
  it('Leq só de aulas calibradas, média energética', () => {
    expect(ws[2].leq).toBeCloseTo(64.45, 2)
    expect(ws[2].allCalibrated).toBe(true)
    expect(ws[3].leq).toBeNull()
    expect(ws[3].allCalibrated).toBe(false)
  })
})

describe('turmas', () => {
  it('tendência compara metade recente com a antiga', () => {
    const ls = [10, 12, 4, 2].map((a, i) => L('8º B', `2026-03-0${i + 2}T10:00:00`, a))
    const [t] = turmaTrends(ls)
    expect(t.aulas).toBe(4)
    expect(t.serie.map(Math.round)).toEqual([20, 24, 8, 4])
    expect(t.tendencia).toBeCloseTo(6 - 22, 6)
    expect(trendLabel(t.tendencia)).toBe('mais calma')
    expect(t.vocalPorHora).toBeCloseTo(24, 6)
  })
  it('com menos de 4 aulas não afirma tendência', () => {
    const [t] = turmaTrends([L('9º', '2026-03-02T10:00:00', 5)])
    expect(t.tendencia).toBeNull()
    expect(trendLabel(t.tendencia)).toBe('poucas aulas')
    expect(trendLabel(3)).toBe('estável')
    expect(trendLabel(7)).toBe('mais barulhenta')
  })
  it('ordena da turma com mais tempo alto para a com menos', () => {
    const ts = turmaTrends([L('A', '2026-03-02T10:00:00', 5), L('B', '2026-03-02T11:00:00', 30)])
    expect(ts.map((t) => t.turma)).toEqual(['B', 'A'])
  })
})

describe('resumo de sessão', () => {
  it('extrai os números do relatório', () => {
    const t0 = Date.UTC(2026, 2, 2, 13)
    const s = newSession({ calibration: cal, thresholds: T, turma: ' 6º C ', now: t0 })
    const seg = openSegment(s, t0, 'pausa')
    for (let i = 0; i < 480; i++) pushLevel(seg, 70 - 100)
    finalize(s, t0 + 60000)
    const sum = summarizeSession(s)
    expect(sum).toMatchObject({ turma: '6º C', calibrated: true, measuredMs: 60000, altoMs: 60000 })
    expect(sum.leq).toBeCloseTo(70, 6)
  })
})
