import { describe, expect, it } from 'vitest'
import { goalDots, sameTurma, weeklyCalmMs } from '../src/lib/weekly'
import { extend, startCountdown, view } from '../src/lib/timer'
import { finalize, newSession, openSegment, pushLevel } from '../src/lib/session'

const T = { calmoAte: 55, altoDesde: 65, esforcoVocal: 43 }
const cal = { offset: 100, method: 'medidor' as const, margin: 3, date: '', device: '' }

function lesson(turma: string, start: Date, calmMin: number, loudMin: number, ended = true) {
  const t0 = start.getTime()
  const s = newSession({ calibration: cal, thresholds: T, turma, now: t0 })
  const seg = openSegment(s, t0, 'pausa')
  for (let i = 0; i < calmMin * 480; i++) pushLevel(seg, 50 - 100)
  for (let i = 0; i < loudMin * 480; i++) pushLevel(seg, 70 - 100)
  if (ended) finalize(s, t0 + (calmMin + loudMin) * 60_000)
  return s
}

describe('meta coletiva da semana', () => {
  const now = new Date(2026, 2, 18, 15).getTime() // quarta
  const ss = [
    lesson('7º B', new Date(2026, 2, 16, 8), 20, 5), // segunda: conta
    lesson(' 7º  b ', new Date(2026, 2, 17, 8), 15, 30), // terça, mesma turma escrita diferente: conta
    lesson('7º B', new Date(2026, 2, 13, 8), 40, 0), // sexta passada: não conta
    lesson('8º A', new Date(2026, 2, 17, 10), 50, 0), // outra turma: não conta
    lesson('7º B', new Date(2026, 2, 18, 13), 10, 0, false), // em andamento: soma ao vivo, não aqui
  ]
  it('soma só o tempo calmo da turma nesta semana', () => {
    expect(weeklyCalmMs(ss, '7º B', now)).toBe(35 * 60_000)
  })
  it('exclui a aula em andamento (somada ao vivo)', () => {
    const atual = lesson('7º B', new Date(2026, 2, 18, 14), 5, 0)
    expect(weeklyCalmMs([...ss, atual], '7º B', now, atual.id)).toBe(35 * 60_000)
  })
  it('turma vazia não soma nada', () => {
    expect(weeklyCalmMs(ss, '', now)).toBe(0)
    expect(sameTurma('', '')).toBe(false)
  })
  it('compara turmas ignorando acentos, espaços e maiúsculas', () => {
    expect(sameTurma('2ª Série  A', '2ª série a')).toBe(true)
    expect(sameTurma('Música', 'musica')).toBe(true)
    expect(sameTurma('7º A', '7º B')).toBe(false)
  })
})

describe('bolinhas da meta (sem números)', () => {
  it('uma bolinha por minuto até 12', () => {
    expect(goalDots(0, 10 * 60_000)).toEqual({ total: 10, filled: 0 })
    expect(goalDots(6.5 * 60_000, 10 * 60_000)).toEqual({ total: 10, filled: 6 })
    expect(goalDots(10 * 60_000, 10 * 60_000)).toEqual({ total: 10, filled: 10 })
    expect(goalDots(99 * 60_000, 10 * 60_000).filled).toBe(10)
  })
  it('metas longas agrupam em 12 bolinhas', () => {
    expect(goalDots(30 * 60_000, 60 * 60_000)).toEqual({ total: 12, filled: 6 })
  })
  it('sem meta, sem bolinhas', () => expect(goalDots(5, 0)).toEqual({ total: 0, filled: 0 }))
})

describe('cronômetro', () => {
  const t0 = 1_000_000
  it('contagem regressiva', () => {
    const c = startCountdown(5, 'Grupo', t0)
    expect(view(c, t0)).toMatchObject({ clock: '5:00', fraction: 1, done: false })
    expect(view(c, t0 + 2 * 60_000 + 28_000).clock).toBe('2:32')
    expect(view(c, t0 + 2.5 * 60_000).fraction).toBeCloseTo(0.5, 6)
    expect(view(c, t0 + 5 * 60_000)).toMatchObject({ clock: '0:00', done: true, fraction: 0 })
    expect(view(c, t0 + 9 * 60_000).remainingMs).toBe(0)
  })
  it('arredonda para cima (não mostra 0:00 antes da hora)', () => {
    expect(view(startCountdown(1, '', t0), t0 + 59_500).clock).toBe('0:01')
  })
  it('+1 min estende sem a barra voltar ao começo', () => {
    const c = startCountdown(5, '', t0)
    const now = t0 + 4 * 60_000
    const e = extend(c, 60_000, now)
    const v = view(e, now)
    expect(v.clock).toBe('2:00')
    expect(v.fraction).toBeCloseTo(2 / 6, 6)
  })
  it('+1 min depois de acabar recomeça do zero', () => {
    const c = startCountdown(1, '', t0)
    const now = t0 + 3 * 60_000
    const v = view(extend(c, 60_000, now), now)
    expect(v.clock).toBe('1:00')
    expect(v.done).toBe(false)
  })
})
