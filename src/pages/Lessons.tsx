import { useEffect, useState } from 'preact/hooks'
import { listRooms, listSessions } from '../lib/db'
import { appUrl, bundle, bundleName, SHARE_MESSAGE, shareFile, type Period } from '../lib/share'
import type { RoomMeasurement } from '../lib/room'
import { APP } from '../config'
import { needsBackupReminder } from '../lib/backup'
import { settings } from '../state/settings'
import { IconSend } from '../ui/icons'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'semana', label: 'Esta semana' },
  { id: '30-dias', label: 'Últimos 30 dias' },
  { id: 'todas', label: 'Todas' },
]

/** Um arquivo único com várias aulas (e salas vazias) para a coordenação. */
function SendMany({ sessions }: { sessions: Session[] }) {
  const [rooms, setRooms] = useState<RoomMeasurement[]>([])
  const [period, setPeriod] = useState<Period>('semana')
  const [withRooms, setWithRooms] = useState(true)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    listRooms().then(setRooms, () => setRooms([]))
  }, [])

  const items = bundle(sessions, withRooms ? rooms : [], period)
  const nAulas = items.filter((x) => x.formato === 'sala-calma/aula').length
  const nSalas = items.length - nAulas
  const parts = [nAulas && `${nAulas} ${nAulas === 1 ? 'aula' : 'aulas'}`, nSalas && `${nSalas} ${nSalas === 1 ? 'sala vazia' : 'salas vazias'}`].filter(Boolean)
  const what = parts.join(' e ')

  const send = () => {
    const text = `${APP.name} · ${what} (${PERIODS.find((p) => p.id === period)!.label.toLowerCase()}).\nArquivo em anexo: abra na tela Escola de ${appUrl()}`
    void shareFile({ name: bundleName(items.length), json: JSON.stringify(items), text, title: `${APP.name} · ${what}` }).then((r) =>
      setMsg(SHARE_MESSAGE[r]),
    )
  }

  return (
    <section class="send-many">
      <h2>Enviar várias para a coordenação</h2>
      <p class="small soft">Junta tudo num arquivo só, que a coordenação abre de uma vez na tela Escola.</p>
      <div class="grid-2">
        <div class="field">
          <label for="periodo">Período</label>
          <select id="periodo" value={period} onChange={(e) => setPeriod(e.currentTarget.value as Period)}>
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {rooms.length > 0 && (
          <label class="check">
            <input type="checkbox" checked={withRooms} onChange={(e) => setWithRooms(e.currentTarget.checked)} />
            Incluir medições de sala vazia
          </label>
        )}
      </div>
      {items.length === 0 ? (
        <p class="small">Nenhuma aula encerrada nesse período.</p>
      ) : (
        <>
          <button class="btn btn-primary" onClick={send}>
            <IconSend /> Enviar {what}
          </button>
          <p class="small share-msg" role="status" aria-live="polite">
            {msg}
          </p>
        </>
      )}
    </section>
  )
}
import { computeReport, type Session } from '../lib/session'
import { dateShort, dec, dur, hhmm } from '../ui/format'

export function LessonsTabs({ current }: { current: 'lista' | 'evolucao' | 'salas' }) {
  const tabs = [
    { id: 'lista', href: '#/aulas', label: 'Aulas' },
    { id: 'evolucao', href: '#/evolucao', label: 'Evolução' },
    { id: 'salas', href: '#/sala-vazia', label: 'Sala vazia' },
  ] as const
  return (
    <nav class="subtabs" aria-label="Aulas e medições">
      {tabs.map((t) => (
        <a key={t.id} href={t.href} aria-current={current === t.id ? 'page' : undefined}>
          {t.label}
        </a>
      ))}
    </nav>
  )
}

interface Row {
  s: Session
  leq: number
  pctAlto: number
  measured: number
}

export function Lessons() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    listSessions()
      .then((all) =>
        setRows(
          all
            .filter((s) => s.endedAt !== null)
            .map((s) => {
              const r = computeReport(s)
              return { s, leq: r.leq, measured: r.measuredMs, pctAlto: r.measuredMs ? (r.bandMs.alto / r.measuredMs) * 100 : 0 }
            }),
        ),
      )
      .catch(() => setErr(true))
  }, [])

  if (err)
    return (
      <div>
        <h1>Aulas</h1>
        <p class="note note-error">Não consegui abrir o armazenamento do aparelho. Se estiver em aba anônima, abra o app numa aba normal.</p>
      </div>
    )
  if (!rows) return <p class="soft">Carregando…</p>

  return (
    <div class="lessons">
      <LessonsTabs current="lista" />
      <h1>Aulas</h1>
      {rows.length > 0 && needsBackupReminder(rows.length, settings.get().ultimoBackup) && (
        <p class="note small">
          As aulas ficam só neste aparelho e {settings.get().ultimoBackup ? 'o último backup tem mais de 30 dias' : 'ainda não há backup'}.{' '}
          <a href="#/backup">Fazer backup agora</a>
        </p>
      )}
      {rows.length === 0 ? (
        <div class="empty">
          <p>Nenhuma aula medida neste aparelho ainda.</p>
          <p>
            Comece pela tela <a href="#/medir">Medir</a>. Quando encerrar a aula, o relatório aparece aqui.
          </p>
        </div>
      ) : (
        <table class="ledger">
          <caption class="visually-hidden">Aulas medidas neste aparelho, da mais recente para a mais antiga</caption>
          <thead>
            <tr>
              <th scope="col">Quando</th>
              <th scope="col">Turma</th>
              <th scope="col" class="r">Duração</th>
              <th scope="col" class="r">Média</th>
              <th scope="col" class="r">Faixa alta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, leq, pctAlto, measured }) => (
              <tr key={s.id}>
                <td class="num">
                  <a href={`#/aula/${s.id}`}>
                    {dateShort(s.startedAt)} <span class="soft">{hhmm(s.startedAt)}</span>
                  </a>
                </td>
                <td>{[s.turma, s.disciplina].filter(Boolean).join(' · ') || <span class="soft">sem nome</span>}</td>
                <td class="r num">{dur(measured)}</td>
                <td class="r num">{s.calibration ? `${dec(leq)} dB(A)` : <span class="soft">relativo</span>}</td>
                <td class="r num">{Math.round(pctAlto)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > 0 && <SendMany sessions={rows.map((r) => r.s)} />}
    </div>
  )
}
