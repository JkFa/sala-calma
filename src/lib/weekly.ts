/**
 * Meta coletiva da semana: tempo de sala calma que a turma juntou nas
 * aulas desta semana (segunda a domingo). Só soma; nunca desconta.
 */
import { weekStart } from './evolution'
import { computeReport, type Session } from './session'

/** Compara turmas sem diferenciar maiúsculas, espaços e acentos. */
export function sameTurma(a: string, b: string): boolean {
  const n = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  return n(a) !== '' && n(a) === n(b)
}

/**
 * Tempo calmo (ms) da turma nas aulas encerradas desta semana, sem contar
 * a aula `excludeId` (a que está em andamento, somada ao vivo).
 */
export function weeklyCalmMs(sessions: Session[], turma: string, now = Date.now(), excludeId?: string): number {
  const from = weekStart(now)
  let total = 0
  for (const s of sessions) {
    if (s.id === excludeId || s.endedAt === null) continue
    if (s.startedAt < from || s.startedAt > now) continue
    if (!sameTurma(s.turma, turma)) continue
    total += computeReport(s).bandMs.calmo
  }
  return total
}

/**
 * Pontos da meta para o modo sem números: quantas bolinhas mostrar e
 * quantas estão cheias. Até 12 bolinhas; cada uma vale meta/n.
 */
export function goalDots(doneMs: number, goalMs: number, maxDots = 12): { total: number; filled: number } {
  if (goalMs <= 0) return { total: 0, filled: 0 }
  const min = Math.round(goalMs / 60_000)
  const total = Math.max(1, Math.min(maxDots, min))
  const filled = Math.min(total, Math.floor((doneMs / goalMs) * total + 1e-9))
  return { total, filled }
}
