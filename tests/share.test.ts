import { describe, expect, it, vi } from 'vitest'
import { appUrl, bundle, bundleName, lessonSummaryText, periodStart, roomSummaryText, shareFile, shareText, type ShareEnv } from '../src/lib/share'
import { finalize, newSession, openSegment, pushLevel } from '../src/lib/session'
import { addMark } from '../src/lib/activities'
import { makeRoomMeasurement } from '../src/lib/room'
import { isExportedLesson } from '../src/lib/exporting'

const T = { calmoAte: 55, altoDesde: 65, esforcoVocal: 43 }
const cal = { offset: 100, method: 'medidor' as const, margin: 3, date: '', device: '' }

function lesson(iso: string, opts: { calibrated?: boolean; marks?: boolean; ended?: boolean } = {}) {
  const t0 = new Date(iso).getTime()
  const s = newSession({ calibration: opts.calibrated === false ? null : cal, thresholds: T, turma: '7º B', disciplina: 'Ciências', now: t0 })
  const seg = openSegment(s, t0, 'pausa')
  if (opts.marks) s.marks = addMark([], 'explicacao', t0)
  for (let i = 0; i < 300 * 8; i++) pushLevel(seg, 52 - 100)
  if (opts.marks) s.marks = addMark(s.marks!, 'grupo', t0 + 300_000)
  for (let i = 0; i < 300 * 8; i++) pushLevel(seg, 70 - 100)
  if (opts.ended !== false) finalize(s, t0 + 600_000)
  return s
}

describe('resumo em texto', () => {
  it('aula calibrada com momentos', () => {
    const txt = lessonSummaryText(lesson('2026-03-03T13:10:00', { marks: true }), undefined, 'https://sala-calma.vercel.app/')
    expect(txt).toContain('Sala Calma · 7º B · Ciências')
    expect(txt).toContain('10 min medidos')
    expect(txt).toMatch(/Média 67,\d dB\(A\) \(±3 dB\)/)
    expect(txt).toContain('Faixa alta: 50% do tempo')
    expect(txt).toContain('Momento mais barulhento: Grupo (100% na faixa alta)')
    expect(txt).toContain('abra na tela Escola de https://sala-calma.vercel.app/')
  })
  it('sem calibração não mostra dB', () => {
    const txt = lessonSummaryText(lesson('2026-03-03T13:10:00', { calibrated: false }))
    expect(txt).toContain('Valores relativos')
    expect(txt).not.toMatch(/dB\(A\)/)
  })
  it('sala vazia', () => {
    const m = makeRoomMeasurement({ sala: 'Sala 12', dbfs: Array(480).fill(-55), windowMs: 125, calibration: cal, condicoes: [], now: Date.parse('2026-03-03T10:00:00') })
    const txt = roomSummaryText(m)
    expect(txt).toContain('Sala vazia · Sala 12')
    expect(txt).toContain('Média 45,0 dB(A) (±3 dB): acima dos 35 dB(A) da OMS')
    expect(txt).toContain('Ruído constante')
  })
  it('endereço do app sem index.html', () => {
    expect(appUrl({ origin: 'https://jkfa.github.io', pathname: '/sala-calma/index.html' })).toBe('https://jkfa.github.io/sala-calma/')
  })
})

describe('arquivo único', () => {
  const now = new Date(2026, 2, 18, 12).getTime() // quarta
  const ss = [lesson('2026-03-17T10:00:00'), lesson('2026-03-02T10:00:00'), lesson('2026-01-10T10:00:00'), lesson('2026-03-18T09:00:00', { ended: false })]
  const room = makeRoomMeasurement({ sala: 'Sala 3', dbfs: Array(480).fill(-60), windowMs: 125, calibration: cal, condicoes: [], now: new Date(2026, 2, 16, 8).getTime() })
  it('filtra por período e ignora aula em andamento', () => {
    expect(bundle(ss, [room], 'semana', now)).toHaveLength(2) // 1 aula + 1 sala
    expect(bundle(ss, [room], '30-dias', now)).toHaveLength(3)
    expect(bundle(ss, [room], 'todas', now)).toHaveLength(4)
  })
  it('aulas em ordem cronológica e no formato da escola', () => {
    const b = bundle(ss, [], 'todas', now)
    expect(b.every(isExportedLesson)).toBe(true)
    expect((b as { inicio: string }[]).map((x) => x.inicio.slice(0, 10))).toEqual(['2026-01-10', '2026-03-02', '2026-03-17'])
  })
  it('semana começa na segunda', () => {
    expect(new Date(periodStart('semana', now))).toEqual(new Date(2026, 2, 16))
  })
  it('nome do arquivo', () => expect(bundleName(5, now)).toBe('sala-calma_2026-03-18_5-registros.json'))
})

function env(over: Partial<ShareEnv> = {}): ShareEnv & { downloads: string[] } {
  const downloads: string[] = []
  return { downloads, download: (n) => downloads.push(n), ...over }
}
const opts = { name: 'aula.json', json: '{"a":1}', text: 'resumo', title: 'Sala Calma' }

describe('compartilhar arquivo', () => {
  it('usa .json quando o aparelho aceita', async () => {
    const share = vi.fn(async () => {})
    const e = env({ canShare: () => true, share })
    expect(await shareFile(opts, e)).toBe('compartilhado')
    const data = share.mock.calls[0][0] as ShareData
    expect(data.files![0].name).toBe('aula.json')
    expect(data.text).toBe('resumo')
    expect(e.downloads).toEqual([])
  })
  it('cai para .txt quando .json é recusado (Chrome Android)', async () => {
    const share = vi.fn(async () => {})
    const e = env({ canShare: (d) => d.files![0].type === 'text/plain', share })
    expect(await shareFile(opts, e)).toBe('compartilhado-txt')
    expect((share.mock.calls[0][0] as ShareData).files![0].name).toBe('aula.txt')
  })
  it('cancelar não baixa nada', async () => {
    const e = env({ canShare: () => true, share: async () => { throw new DOMException('x', 'AbortError') } })
    expect(await shareFile(opts, e)).toBe('cancelado')
    expect(e.downloads).toEqual([])
  })
  it('sem menu de compartilhar: baixa e copia o resumo', async () => {
    const copy = vi.fn(async () => {})
    const e = env({ copy })
    expect(await shareFile(opts, e)).toBe('baixado-e-copiado')
    expect(e.downloads).toEqual(['aula.json'])
    expect(copy).toHaveBeenCalledWith('resumo')
  })
  it('erro de verdade no share cai para download', async () => {
    const e = env({ canShare: () => true, share: async () => { throw new DOMException('x', 'NotAllowedError') } })
    expect(await shareFile(opts, e)).toBe('baixado')
    expect(e.downloads).toEqual(['aula.json'])
  })
})

describe('compartilhar texto', () => {
  it('usa o menu quando existe', async () => {
    const share = vi.fn(async () => {})
    expect(await shareText('oi', 't', env({ share }))).toBe('compartilhado')
  })
  it('sem menu, copia', async () => {
    expect(await shareText('oi', 't', env({ copy: async () => {} }))).toBe('copiado')
  })
  it('sem nada, avisa', async () => {
    expect(await shareText('oi', 't', env())).toBe('falhou')
  })
})
