/**
 * Compartilhar com a coordenação (WhatsApp, e-mail…) pelo menu do próprio
 * aparelho (Web Share API). Onde não existir, baixa o arquivo e copia o
 * resumo. Nada passa por servidor.
 *
 * Importante: o Chrome do Android só compartilha alguns tipos de arquivo,
 * e .json não está entre eles. Nesse caso o mesmo conteúdo vai como .txt
 * (o painel da escola aceita os dois).
 */
import { APP } from '../config'
import { ACTIVITY_LABEL, loudestActivity, statsByActivity } from './activities'
import { toExport, type ExportedLesson } from './exporting'
import { computeReport, type Report, type Session } from './session'
import { noiseCharacter, OMS_SALA_DBA, roomToExport, roomVerdict, type ExportedRoom, type RoomMeasurement } from './room'

const dec = (n: number, d = 1) =>
  Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'
const min = (ms: number) => Math.round(ms / 60000)
const when = (t: number) =>
  new Date(t).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Endereço público do app, para quem recebe saber onde abrir o arquivo. */
export function appUrl(loc: Pick<Location, 'origin' | 'pathname'> = location): string {
  return loc.origin + loc.pathname.replace(/index\.html$/, '')
}

/** Resumo curto de uma aula, para mensagem de WhatsApp/e-mail. */
export function lessonSummaryText(s: Session, r: Report = computeReport(s), url = ''): string {
  const title = [s.turma, s.disciplina].filter(Boolean).join(' · ') || 'Aula'
  const lines = [`${APP.name} · ${title}`, `${when(s.startedAt)} · ${min(r.measuredMs)} min medidos`]
  if (r.calibrated) lines.push(`Média ${dec(r.leq)} dB(A) (±${r.margin} dB) · fundo ${dec(r.l90)} dB(A)`)
  else lines.push('Valores relativos (aparelho sem calibração)')
  const pct = r.measuredMs ? Math.round((r.bandMs.alto / r.measuredMs) * 100) : 0
  lines.push(`Faixa alta: ${pct}% do tempo · Tempo de Risco Vocal: ${min(r.vocalMs)} min`)
  if (s.marks?.length) {
    const loud = loudestActivity(statsByActivity(s))
    if (loud) lines.push(`Momento mais barulhento: ${ACTIVITY_LABEL[loud.kind]} (${Math.round(loud.pctAlto)}% na faixa alta)`)
  }
  if (url) lines.push(`Arquivo em anexo: abra na tela Escola de ${url}`)
  return lines.join('\n')
}

/** Resumo curto de uma medição de sala vazia. */
export function roomSummaryText(m: RoomMeasurement, url = ''): string {
  const v = roomVerdict(m)
  const lines = [`${APP.name} · Sala vazia · ${m.sala || 'sem nome'}`, `${when(m.createdAt)} · ${m.durationS} s`]
  if (m.calibration) {
    const verdict = {
      dentro: `abaixo dos ${OMS_SALA_DBA} dB(A) da OMS`,
      'na-margem': `perto dos ${OMS_SALA_DBA} dB(A) da OMS (dentro da margem de erro)`,
      acima: `acima dos ${OMS_SALA_DBA} dB(A) da OMS`,
      'bem-acima': `bem acima dos ${OMS_SALA_DBA} dB(A) da OMS`,
      'sem-calibracao': '',
    }[v]
    lines.push(`Média ${dec(m.leq)} dB(A) (±${m.calibration.margin} dB): ${verdict}`)
  } else {
    lines.push('Aparelho sem calibração: sem comparação com a OMS')
  }
  lines.push(`Ruído ${noiseCharacter(m)}`)
  if (url) lines.push(`Arquivo em anexo: abra na tela Escola de ${url}`)
  return lines.join('\n')
}

export type Period = 'semana' | '30-dias' | 'todas'

/** Início do período (epoch ms). Semana começa na segunda, 00:00. */
export function periodStart(p: Period, now = Date.now()): number {
  if (p === 'todas') return 0
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  if (p === 'semana') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  else d.setDate(d.getDate() - 29)
  return d.getTime()
}

/** Um arquivo único com várias aulas e salas vazias (o painel lê listas). */
export function bundle(
  sessions: Session[],
  rooms: RoomMeasurement[],
  period: Period,
  now = Date.now(),
): (ExportedLesson | ExportedRoom)[] {
  const from = periodStart(period, now)
  return [
    ...sessions.filter((s) => s.endedAt !== null && s.startedAt >= from).sort((a, b) => a.startedAt - b.startedAt).map((s) => toExport(s)),
    ...rooms.filter((m) => m.createdAt >= from).sort((a, b) => a.createdAt - b.createdAt).map(roomToExport),
  ]
}

export function bundleName(n: number, now = Date.now()): string {
  const d = new Date(now)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `sala-calma_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${n}-registros.json`
}

// ---------- Compartilhar (com ambiente injetável, para testar) ----------

export interface ShareEnv {
  canShare?: (data: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
  download: (name: string, content: string, type: string) => void
  copy?: (text: string) => Promise<void>
}

export type ShareResult =
  | 'compartilhado'
  | 'compartilhado-txt'
  | 'cancelado'
  | 'baixado'
  | 'baixado-e-copiado'
  | 'copiado'
  | 'falhou'

export function browserEnv(): ShareEnv {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  return {
    canShare: nav?.canShare ? (d) => nav.canShare(d) : undefined,
    share: nav?.share ? (d) => nav.share(d) : undefined,
    copy: nav?.clipboard?.writeText ? (t) => nav.clipboard.writeText(t) : undefined,
    download: (name, content, type) => {
      const blob = new Blob([content], { type })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  }
}

const isAbort = (e: unknown) => (e as { name?: string })?.name === 'AbortError'

/**
 * Compartilha um arquivo JSON + texto. Tenta, nesta ordem:
 * 1) arquivo .json pelo menu do aparelho; 2) o mesmo conteúdo como .txt;
 * 3) baixar o .json e copiar o texto.
 * Deve ser chamada direto do toque (sem await antes), senão o Safari recusa.
 */
export async function shareFile(
  opts: { name: string; json: string; text: string; title: string },
  env: ShareEnv = browserEnv(),
): Promise<ShareResult> {
  const attempts: [File, ShareResult][] = []
  if (typeof File !== 'undefined') {
    attempts.push([new File([opts.json], opts.name, { type: 'application/json' }), 'compartilhado'])
    attempts.push([new File([opts.json], opts.name.replace(/\.json$/, '.txt'), { type: 'text/plain' }), 'compartilhado-txt'])
  }
  if (env.share && env.canShare) {
    for (const [file, result] of attempts) {
      const data: ShareData = { files: [file], title: opts.title, text: opts.text }
      if (!env.canShare(data)) continue
      try {
        await env.share(data)
        return result
      } catch (e) {
        if (isAbort(e)) return 'cancelado'
        break // erro de verdade: cai para o download
      }
    }
  }
  env.download(opts.name, opts.json, 'application/json')
  if (env.copy) {
    try {
      await env.copy(opts.text)
      return 'baixado-e-copiado'
    } catch {
      /* sem permissão de área de transferência */
    }
  }
  return 'baixado'
}

/** Compartilha só o texto; sem menu de compartilhar, copia. */
export async function shareText(text: string, title: string, env: ShareEnv = browserEnv()): Promise<ShareResult> {
  if (env.share && (!env.canShare || env.canShare({ text, title }))) {
    try {
      await env.share({ text, title })
      return 'compartilhado'
    } catch (e) {
      if (isAbort(e)) return 'cancelado'
    }
  }
  if (env.copy) {
    try {
      await env.copy(text)
      return 'copiado'
    } catch {
      /* segue */
    }
  }
  return 'falhou'
}

/** Mensagem para o professor depois de compartilhar. */
export const SHARE_MESSAGE: Record<ShareResult, string> = {
  compartilhado: 'Enviado.',
  'compartilhado-txt': 'Enviado. O arquivo vai como .txt (exigência do Android); a tela Escola abre normalmente.',
  cancelado: '',
  baixado: 'Este navegador não tem o menu de compartilhar. O arquivo foi baixado: anexe no WhatsApp ou no e-mail.',
  'baixado-e-copiado':
    'Este navegador não tem o menu de compartilhar. O arquivo foi baixado e o resumo foi copiado: cole na mensagem e anexe o arquivo.',
  copiado: 'Resumo copiado. Cole no WhatsApp ou no e-mail.',
  falhou: 'Não consegui compartilhar nem copiar. Use os botões de baixar abaixo.',
}
