import { useEffect, useState } from 'preact/hooks'
import { listSessions } from '../lib/db'
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
    </div>
  )
}
