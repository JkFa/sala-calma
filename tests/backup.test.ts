import { describe, expect, it } from 'vitest'
import { applySettings, backupName, isBackup, makeBackup, needsBackupReminder, planRestore, validSession } from '../src/lib/backup'
import { finalize, newSession, openSegment, pushLevel } from '../src/lib/session'
import { makeRoomMeasurement } from '../src/lib/room'
import type { Settings } from '../src/state/settings'

const T = { calmoAte: 55, altoDesde: 65, esforcoVocal: 43 }
const calA = { offset: 104.2, method: 'medidor' as const, margin: 3, date: '2026-03-01T00:00:00Z', device: 'Aparelho A' }
const calB = { offset: 97.5, method: 'medidor' as const, margin: 3, date: '2026-03-05T00:00:00Z', device: 'Aparelho B' }

const settingsA: Settings = {
  thresholds: { calmoAte: 52, altoDesde: 62, esforcoVocal: 43 },
  calibration: calA, theme: 'escuro', mudo: true, metaMinutos: 15,
  ultimaTurma: '7º B', ultimaDisciplina: 'Ciências', viuDicaMesa: true, ultimoBackup: null,
}
const settingsB: Settings = { ...settingsA, thresholds: T, calibration: calB, theme: 'auto', mudo: false, metaMinutos: 10, ultimaTurma: '9º A' }

function lesson(id: string, open = false) {
  const t0 = Date.UTC(2026, 2, 2, 13)
  const s = newSession({ calibration: calA, thresholds: T, turma: '7º B', now: t0 })
  s.id = id
  const seg = openSegment(s, t0, 'pausa')
  for (let i = 0; i < 80; i++) pushLevel(seg, -40)
  if (!open) finalize(s, t0 + 10_000)
  return s
}
const room = (id: string) => ({ ...makeRoomMeasurement({ sala: 'Sala 3', dbfs: Array(80).fill(-60), windowMs: 125, calibration: calA, condicoes: [] }), id })

describe('gerar backup', () => {
  const b = makeBackup([lesson('a1'), lesson('a2')], [room('r1')], settingsA, 'Aparelho A', Date.UTC(2026, 2, 10))
  it('formato reconhecível, com tudo', () => {
    expect(isBackup(b)).toBe(true)
    expect(b.aulas).toHaveLength(2)
    expect(b.salas).toHaveLength(1)
    expect(b.ajustes).toEqual({ thresholds: settingsA.thresholds, calibration: calA, theme: 'escuro', mudo: true, metaMinutos: 15 })
  })
  it('não leva dados que só fazem sentido no aparelho (última turma etc.)', () => {
    expect(JSON.stringify(b)).not.toContain('ultimaTurma')
  })
  it('sobrevive a ida e volta em JSON', () => {
    expect(isBackup(JSON.parse(JSON.stringify(b)))).toBe(true)
    expect(validSession(JSON.parse(JSON.stringify(b.aulas[0])))).toBe(true)
  })
  it('nome do arquivo', () => expect(backupName(Date.UTC(2026, 2, 10, 12))).toBe('sala-calma_backup_2026-03-10.json'))
  it('recusa outros formatos', () => {
    expect(isBackup({ formato: 'sala-calma/aula' })).toBe(false)
    expect(isBackup([1, 2])).toBe(false)
  })
})

describe('restaurar', () => {
  const b = JSON.parse(JSON.stringify(makeBackup([lesson('a1'), lesson('a2'), lesson('a3', true)], [room('r1')], settingsA, 'Aparelho A')))
  it('junta: só grava o que falta, nunca sobrescreve', () => {
    const p = planRestore(b, new Set(['a1']), new Set())
    expect(p.novasAulas.map((s) => s.id)).toEqual(['a2', 'a3'])
    expect(p.aulasRepetidas).toBe(1)
    expect(p.novasSalas).toHaveLength(1)
  })
  it('restaurar duas vezes não duplica', () => {
    const p = planRestore(b, new Set(['a1', 'a2', 'a3']), new Set(['r1']))
    expect(p.novasAulas).toHaveLength(0)
    expect(p.novasSalas).toHaveLength(0)
    expect(p.aulasRepetidas).toBe(3)
    expect(p.salasRepetidas).toBe(1)
  })
  it('aula que ficou aberta entra encerrada (não vira "aula pendente")', () => {
    const p = planRestore(b, new Set(), new Set())
    const a3 = p.novasAulas.find((s) => s.id === 'a3')!
    expect(a3.endedAt).toBe(Date.UTC(2026, 2, 2, 13) + 10_000)
  })
  it('descarta itens malformados e conta', () => {
    const bad = { ...b, aulas: [...b.aulas, { id: 'x', segments: 'nada' }, { ...b.aulas[0], id: 'y', segments: [{ start: 1, levels: [1, 'a'] }] }], salas: [...b.salas, { id: 'z' }] }
    const p = planRestore(bad, new Set(), new Set())
    expect(p.invalidos).toBe(3)
    expect(p.novasAulas).toHaveLength(3)
  })
  it('id repetido dentro do próprio arquivo entra uma vez', () => {
    const dup = { ...b, aulas: [b.aulas[0], b.aulas[0]] }
    expect(planRestore(dup, new Set(), new Set()).novasAulas).toHaveLength(1)
  })
})

describe('ajustes e calibração', () => {
  const b = JSON.parse(JSON.stringify(makeBackup([], [], settingsA, 'Aparelho A')))
  const p = planRestore(b, new Set(), new Set())
  it('por padrão traz faixas/meta/tema, mas NÃO a calibração do outro aparelho', () => {
    const next = applySettings(settingsB, p, { ajustes: true, calibracao: false })
    expect(next.thresholds).toEqual(settingsA.thresholds)
    expect(next.theme).toBe('escuro')
    expect(next.metaMinutos).toBe(15)
    expect(next.calibration).toEqual(calB) // mantém a deste aparelho
    expect(next.ultimaTurma).toBe('9º A') // dados locais intactos
  })
  it('calibração só com pedido explícito', () => {
    expect(applySettings(settingsB, p, { ajustes: false, calibracao: true }).calibration).toEqual(calA)
  })
  it('sem ajustes marcados, nada muda', () => {
    expect(applySettings(settingsB, p, { ajustes: false, calibracao: false })).toEqual(settingsB)
  })
  it('ajustes inválidos são ignorados', () => {
    const bad = planRestore({ ...b, ajustes: { ...b.ajustes, thresholds: { calmoAte: 70, altoDesde: 60, esforcoVocal: 43 } } }, new Set(), new Set())
    expect(bad.ajustes).toBeNull()
  })
})

describe('lembrete de backup', () => {
  const now = Date.UTC(2026, 5, 1)
  it('poucas aulas: não incomoda', () => expect(needsBackupReminder(4, null, now)).toBe(false))
  it('muitas aulas e nunca fez backup', () => expect(needsBackupReminder(5, null, now)).toBe(true))
  it('backup recente', () => expect(needsBackupReminder(50, new Date(now - 5 * 864e5).toISOString(), now)).toBe(false))
  it('backup antigo', () => expect(needsBackupReminder(50, new Date(now - 40 * 864e5).toISOString(), now)).toBe(true))
})
