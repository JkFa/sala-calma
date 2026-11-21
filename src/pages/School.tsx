/**
 * Painel da escola, sem servidor: a coordenação abre aqui os arquivos
 * JSON que os professores exportaram. Nada é enviado.
 */
import { useMemo, useState } from 'preact/hooks'
import { isExportedLesson, type ExportedLesson } from '../lib/exporting'
import { aggregateActivities, aggregate, byHour, byTurma, byWeekday, dedupe, keyOrder, summarize, weekdayOrder, WEEKDAYS, type Group } from '../lib/school'
import { bandOf, type Thresholds } from '../lib/session'
import { HBar } from '../ui/charts'
import { dateShort, dec } from '../ui/format'
import { IconPrint } from '../ui/icons'
import { settings } from '../state/settings'
import { APP } from '../config'
import { exportedVerdict, isExportedRoom, noiseCharacter, OMS_SALA_DBA, type ExportedRoom, type RoomVerdict } from '../lib/room'

const VERDICT_SHORT: Record<RoomVerdict, { label: string; cls: string }> = {
  'sem-calibracao': { label: 'sem calibração', cls: 'soft' },
  dentro: { label: 'dentro', cls: 'text-calmo' },
  'na-margem': { label: 'no limite (margem)', cls: 'text-atencao' },
  acima: { label: 'acima', cls: 'text-alto' },
  'bem-acima': { label: 'bem acima', cls: 'text-alto' },
}

import { ACTIVITY_LABEL } from '../lib/activities'

/** Momentos da aula somados entre as aulas que tiveram marcação. */
function Activities({ lessons }: { lessons: ExportedLesson[] }) {
  const gs = aggregateActivities(lessons)
  if (!gs.length) return null
  const n = lessons.filter((l) => l.atividades).length
  const maxPct = Math.max(1, ...gs.map((g) => g.pctAlto))
  return (
    <section class="school-group">
      <h2>Por momento da aula</h2>
      <p class="small soft">
        {n} de {lessons.length} aulas tiveram os momentos marcados pelo professor. Mostra que tipo de atividade pesa mais no ruído.
      </p>
      <table class="ledger">
        <thead>
          <tr>
            <th scope="col">Momento</th>
            <th scope="col" class="r">
              Aulas
            </th>
            <th scope="col" class="r">
              Tempo
            </th>
            <th scope="col">Tempo na faixa alta</th>
            <th scope="col" class="r">
              Esforço vocal
            </th>
          </tr>
        </thead>
        <tbody>
          {gs.map((g) => (
            <tr key={g.kind}>
              <th scope="row">{ACTIVITY_LABEL[g.kind]}</th>
              <td class="r num">{g.aulas}</td>
              <td class="r num">{g.minutos} min</td>
              <td class="bar-cell">
                <HBar value={g.pctAlto} max={maxPct} band="alto" />
                <span class="num">{dec(g.pctAlto, 0)}%</span>
              </td>
              <td class="r num">{dec(g.vocalPorHora, 0)} min/h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** Salas vazias: problema do prédio, não da turma. */
function Rooms({ rooms }: { rooms: ExportedRoom[] }) {
  const sorted = [...rooms].sort((a, b) => (b.calibrado ? b.leq : -1) - (a.calibrado ? a.leq : -1))
  const acima = rooms.filter((r) => ['acima', 'bem-acima'].includes(exportedVerdict(r))).length
  return (
    <section class="school-group">
      <h2>Salas vazias</h2>
      <p class="small soft">
        Ruído de fundo sem ninguém na sala, comparado com os {OMS_SALA_DBA} dB(A) recomendados pela OMS.
        {acima > 0 && ` ${acima} de ${rooms.length} medições ficaram acima, além da margem de erro.`}
      </p>
      <table class="ledger">
        <thead>
          <tr>
            <th scope="col">Sala</th>
            <th scope="col">Quando</th>
            <th scope="col" class="r">
              Média
            </th>
            <th scope="col" class="r">
              Fundo
            </th>
            <th scope="col">Tipo</th>
            <th scope="col">OMS</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const v = VERDICT_SHORT[exportedVerdict(r)]
            return (
              <tr key={r.data + r.sala}>
                <th scope="row">{r.sala || '(sem nome)'}</th>
                <td class="num">{dateShort(Date.parse(r.data))}</td>
                <td class="r num">{r.calibrado ? `${dec(r.leq)} dB(A)` : '—'}</td>
                <td class="r num">{r.calibrado ? `${dec(r.l90)} dB(A)` : '—'}</td>
                <td>{noiseCharacter(r)}</td>
                <td class={v.cls}>{v.label}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function GroupTable({ title, groups, t, calibrated }: { title: string; groups: Group[]; t: Thresholds; calibrated: boolean }) {
  const maxPct = Math.max(1, ...groups.map((g) => g.pctAlto))
  return (
    <section class="school-group">
      <h2>{title}</h2>
      <table class="ledger">
        <thead>
          <tr>
            <th scope="col">{title.replace('Por ', '')}</th>
            <th scope="col" class="r">
              Aulas
            </th>
            <th scope="col" class="r">
              Média
            </th>
            <th scope="col">Tempo na faixa alta</th>
            <th scope="col" class="r">
              Esforço vocal
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key}>
              <th scope="row">{g.key}</th>
              <td class="r num">{g.aulas}</td>
              <td class={`r num text-${bandOf(g.leq, t)}`}>{calibrated ? `${dec(g.leq)} dB(A)` : '—'}</td>
              <td class="bar-cell">
                <HBar value={g.pctAlto} max={maxPct} band="alto" />
                <span class="num">{dec(g.pctAlto, 0)}%</span>
              </td>
              <td class="r num">{dec(g.vocalPorHora, 0)} min/h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** Matriz dia × horário: onde e quando a acústica pesa mais. */
function Heat({ lessons }: { lessons: ExportedLesson[] }) {
  const cells = new Map<string, { alto: number; min: number }>()
  const hours = new Set<number>()
  const days = new Set<number>()
  for (const l of lessons) {
    const d = new Date(l.inicio)
    const k = `${d.getDay()}-${d.getHours()}`
    hours.add(d.getHours())
    days.add(d.getDay())
    const c = cells.get(k) ?? { alto: 0, min: 0 }
    c.alto += l.resumo.minutosPorFaixa.alto
    c.min += l.resumo.minutosMedidos
    cells.set(k, c)
  }
  const hs = [...hours].sort((a, b) => a - b)
  const ds = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.has(d))
  if (hs.length < 2 && ds.length < 2) return null
  return (
    <section>
      <h2>Quando a sala fica mais alta</h2>
      <p class="small soft">Porcentagem do tempo medido na faixa alta, por dia da semana e horário de início da aula.</p>
      <div class="heat-wrap">
        <table class="heat">
          <thead>
            <tr>
              <th />
              {hs.map((h) => (
                <th key={h} scope="col" class="num">
                  {String(h).padStart(2, '0')}h
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ds.map((d) => (
              <tr key={d}>
                <th scope="row">{WEEKDAYS[d]}</th>
                {hs.map((h) => {
                  const c = cells.get(`${d}-${h}`)
                  if (!c || !c.min) return <td key={h} class="heat-empty" aria-label="sem dado" />
                  const p = (c.alto / c.min) * 100
                  return (
                    <td key={h} class="num" style={{ '--p': Math.min(1, p / 60) } as never}>
                      {Math.round(p)}%
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function School() {
  const [lessons, setLessons] = useState<ExportedLesson[]>([])
  const [rooms, setRooms] = useState<ExportedRoom[]>([])
  const [problems, setProblems] = useState<string[]>([])
  const t = settings.get().thresholds

  const onFiles = async (files: FileList | null) => {
    if (!files) return
    const ok: ExportedLesson[] = []
    const okRooms: ExportedRoom[] = []
    const bad: string[] = []
    for (const f of Array.from(files)) {
      try {
        const data = JSON.parse(await f.text())
        const list = Array.isArray(data) ? data : [data]
        const valid = list.filter(isExportedLesson)
        const validRooms = list.filter(isExportedRoom)
        if (!valid.length && !validRooms.length) bad.push(f.name)
        ok.push(...valid)
        okRooms.push(...validRooms)
      } catch {
        bad.push(f.name)
      }
    }
    setLessons((prev) => dedupe([...prev, ...ok]))
    setRooms((prev) => {
      const seen = new Set(prev.map((r) => r.data + r.sala))
      return [...prev, ...okRooms.filter((r) => !seen.has(r.data + r.sala) && seen.add(r.data + r.sala))]
    })
    setProblems(bad)
  }

  const sum = useMemo(() => summarize(lessons), [lessons])
  // Mistura calibradas e relativas não faz sentido em dB: usa só calibradas quando houver.
  const base = useMemo(() => (sum.calibradas > 0 ? lessons.filter((l) => l.calibrado) : lessons), [lessons, sum])
  const calibrated = sum.calibradas > 0

  return (
    <div class="school">
      <header class="school-head">
        <p class="print-only small">{APP.name} · painel da escola</p>
        <h1>Escola</h1>
        <p class="lead no-print">
          Junte os arquivos que os professores exportaram (botão “Arquivo para a escola”, no relatório de cada aula e na medição da sala vazia) e veja onde e
          quando a acústica pesa mais. Vale arquivo .json ou .txt (o Android envia como .txt) e arquivo com várias aulas. Os
          arquivos são lidos aqui mesmo, neste navegador. Nada é enviado.
        </p>
      </header>

      <div class="dropzone no-print">
        <label for="files" class="btn btn-primary">
          Escolher arquivos
        </label>
        <input
          id="files"
          class="visually-hidden"
          type="file"
          accept="application/json,.json,text/plain,.txt"
          multiple
          onChange={(e) => {
            void onFiles(e.currentTarget.files)
            e.currentTarget.value = ''
          }}
        />
        {lessons.length + rooms.length > 0 && (
          <button
            class="btn btn-quiet"
            onClick={() => {
              setLessons([])
              setRooms([])
            }}
          >
            Limpar
          </button>
        )}
      </div>
      {problems.length > 0 && (
        <p class="note note-error" role="alert">
          Não reconheci {problems.length === 1 ? 'o arquivo' : 'os arquivos'} {problems.join(', ')}. Só abro arquivos exportados pelo
          próprio {APP.name}.
        </p>
      )}

      {lessons.length === 0 && rooms.length === 0 ? (
        <div class="empty">
          <p>Nenhum arquivo aberto ainda.</p>
          <p class="small soft">
            Dica para a coordenação: peça uma semana de aulas de cada turma, de preferência com aparelhos calibrados. Com poucos
            dados, o painel mostra tendência, não conclusão.
          </p>
        </div>
      ) : (
        <>
          {lessons.length > 0 && (
          <>
          <p class="school-summary">
            <strong class="num">{sum.aulas}</strong> aulas, de {sum.inicio && dateShort(Date.parse(sum.inicio))} a{' '}
            {sum.fim && dateShort(Date.parse(sum.fim))}. <strong class="num">{sum.calibradas}</strong> com aparelho calibrado.
          </p>
          {sum.misto && (
            <p class="note note-warn small">
              Há aulas com e sem calibração. As médias em dB usam só as {sum.calibradas} calibradas; as outras ficaram de fora.
            </p>
          )}
          {!calibrated && (
            <p class="note note-warn small">
              Nenhuma aula veio de aparelho calibrado. Dá para comparar o tempo na faixa alta, mas não as médias em dB.
            </p>
          )}
          <GroupTable title="Por turma" groups={aggregate(base, byTurma)} t={t} calibrated={calibrated} />
          <Heat lessons={base} />
          <GroupTable title="Por dia" groups={aggregate(base, byWeekday, weekdayOrder)} t={t} calibrated={calibrated} />
          <GroupTable title="Por horário" groups={aggregate(base, byHour, keyOrder)} t={t} calibrated={calibrated} />
          <Activities lessons={lessons} />
          </>
          )}
          {rooms.length > 0 && <Rooms rooms={rooms} />}

          <section class="school-notes">
            <h2>Como ler</h2>
            <ul>
              <li>“Esforço vocal” é o tempo, por hora de aula, em que o ruído de fundo passou do limiar em que a voz tende a subir.</li>
              <li>Turmas e horários com muito tempo na faixa alta são candidatos a revisão acústica: forro, janelas, ventiladores, ruído do pátio.</li>
              <li>Sala vazia acima de {OMS_SALA_DBA} dB(A) é problema do ambiente, não da turma: é o dado mais forte para pedir intervenção.</li>
              <li>Os dados não identificam professores. Não use o painel para avaliar desempenho de ninguém.</li>
            </ul>
          </section>
          <button class="btn no-print" onClick={() => window.print()}>
            <IconPrint /> Imprimir ou salvar PDF para direção, CIPA ou Regional
          </button>
          <p class="print-only small">
            Indicadores de exposição ao ruído, a partir de medições com celular. Não substituem laudo acústico nem avaliação de saúde.
            Gerado em {new Date().toLocaleString('pt-BR')}.
          </p>
        </>
      )}
    </div>
  )
}
