import { describe, expect, it } from 'vitest'
import { activityAt, activitySpans, addMark, loudestActivity, statsByActivity, type Mark } from '../src/lib/activities'
import { finalize, newSession, openSegment, pushLevel } from '../src/lib/session'

const T = { calmoAte: 55, altoDesde: 65, esforcoVocal: 43 }
const cal = { offset: 100, method: 'medidor' as const, margin: 3, date: '', device: '' }
const t0 = Date.UTC(2026, 2, 2, 13)

describe('marcar momentos', () => {
  it('adiciona marcação', () => {
    expect(addMark([], 'explicacao', t0)).toEqual([{ t: t0, kind: 'explicacao' }])
  })
  it('mesmo tipo em vigor não duplica', () => {
    const m = addMark([], 'grupo', t0)
    expect(addMark(m, 'grupo', t0 + 60_000)).toBe(m)
  })
  it('troca em menos de 10 s corrige a última', () => {
    const m = addMark(addMark([], 'explicacao', t0), 'grupo', t0 + 60_000)
    expect(addMark(m, 'prova', t0 + 65_000)).toEqual([
      { t: t0, kind: 'explicacao' },
      { t: t0 + 60_000, kind: 'prova' },
    ])
  })
  it('voltar ao tipo anterior em menos de 10 s desfaz o toque errado', () => {
    const m = addMark(addMark([], 'explicacao', t0), 'grupo', t0 + 60_000)
    expect(addMark(m, 'explicacao', t0 + 63_000)).toEqual([{ t: t0, kind: 'explicacao' }])
  })
  it('depois de 10 s cria nova marcação', () => {
    const m = addMark([], 'explicacao', t0)
    expect(addMark(m, 'grupo', t0 + 11_000)).toHaveLength(2)
  })
  it('atividade em vigor num instante', () => {
    const m: Mark[] = [{ t: t0 + 1000, kind: 'explicacao' }, { t: t0 + 5000, kind: 'grupo' }]
    expect(activityAt(m, t0)).toBe('sem-marcacao')
    expect(activityAt(m, t0 + 1000)).toBe('explicacao')
    expect(activityAt(m, t0 + 9000)).toBe('grupo')
    expect(activityAt(undefined, t0)).toBe('sem-marcacao')
  })
})

function lesson() {
  // 1 min sem marcação (50 dB), 3 min explicação (52 dB), 3 min grupo (68 dB), pausa, 2 min grupo (60 dB)
  const s = newSession({ calibration: cal, thresholds: T, now: t0 })
  const a = openSegment(s, t0, 'pausa')
  const put = (seg: { levels: number[] }, db: number, sec: number) => {
    for (let i = 0; i < sec * 8; i++) pushLevel(seg as never, db - 100)
  }
  put(a, 50, 60)
  s.marks = addMark(s.marks!, 'explicacao', t0 + 60_000)
  put(a, 52, 180)
  s.marks = addMark(s.marks!, 'grupo', t0 + 240_000)
  put(a, 68, 180)
  const b = openSegment(s, t0 + 600_000, 'pausa')
  put(b, 60, 120)
  finalize(s, t0 + 720_000)
  return s
}

describe('estatística por atividade', () => {
  const st = statsByActivity(lesson())
  const by = Object.fromEntries(st.map((x) => [x.kind, x]))
  it('separa o tempo medido por atividade, inclusive depois de lacuna', () => {
    expect(st.map((x) => x.kind)).toEqual(['explicacao', 'grupo', 'sem-marcacao'])
    expect(by['sem-marcacao'].measuredMs).toBe(60_000)
    expect(by.explicacao.measuredMs).toBe(180_000)
    expect(by.grupo.measuredMs).toBe(300_000)
  })
  it('faixa alta e Leq por atividade', () => {
    expect(by.explicacao.pctAlto).toBe(0)
    expect(by.grupo.pctAlto).toBeCloseTo(60, 6)
    expect(by.explicacao.leq).toBeCloseTo(52, 6)
  })
  it('Risco Vocal por atividade (fundo acima de 43)', () => {
    expect(by.grupo.vocalMs).toBe(300_000)
  })
  it('destaca a atividade mais barulhenta', () => {
    expect(loudestActivity(st)?.kind).toBe('grupo')
  })
  it('não destaca com uma atividade só ou trechos curtos', () => {
    expect(loudestActivity(st.filter((x) => x.kind !== 'explicacao'))).toBeNull()
  })
  it('aula antiga sem marcações vira tudo "sem marcação"', () => {
    const s = lesson()
    delete s.marks
    const r = statsByActivity(s)
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('sem-marcacao')
    expect(r[0].measuredMs).toBe(540_000)
  })
})

describe('trechos para o gráfico', () => {
  it('cobre do início ao fim, sem buracos', () => {
    const sp = activitySpans([{ t: t0 + 60_000, kind: 'explicacao' }, { t: t0 + 240_000, kind: 'grupo' }], t0, t0 + 720_000)
    expect(sp).toEqual([
      { kind: 'sem-marcacao', a: t0, b: t0 + 60_000 },
      { kind: 'explicacao', a: t0 + 60_000, b: t0 + 240_000 },
      { kind: 'grupo', a: t0 + 240_000, b: t0 + 720_000 },
    ])
  })
  it('marcação no início não gera trecho vazio', () => {
    expect(activitySpans([{ t: t0, kind: 'prova' }], t0, t0 + 1000)).toEqual([{ kind: 'prova', a: t0, b: t0 + 1000 }])
  })
})
