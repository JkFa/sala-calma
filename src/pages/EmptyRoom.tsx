/**
 * Medição da sala vazia: separa o ruído do prédio (ventilador, pátio,
 * trânsito) do ruído da turma. Compara com os 35 dB(A) da OMS.
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import { WINDOW_MS } from '../config'
import { deleteRoom, listRooms, saveRoom } from '../lib/db'
import { download } from '../lib/exporting'
import {
  CONDICOES,
  makeRoomMeasurement,
  noiseCharacter,
  OMS_SALA_DBA,
  roomToExport,
  roomVerdict,
  type CondicaoId,
  type RoomMeasurement,
  type RoomVerdict,
} from '../lib/room'
import { lesson, measureWindows } from '../state/lesson'
import { settings } from '../state/settings'
import { useStore } from '../state/store'
import { dateShort, dec, hhmm } from '../ui/format'
import { IconDownload } from '../ui/icons'
import { LessonsTabs } from './Lessons'
import { MeterError } from '../audio/meter'

const VERDICT: Record<RoomVerdict, { title: string; text: (m: RoomMeasurement) => string; cls: string }> = {
  'sem-calibracao': {
    title: 'Sem comparação',
    text: () =>
      'O aparelho não está calibrado, então não dá para comparar com os 35 dB(A) da OMS. O tipo de ruído (constante ou intermitente) continua válido.',
    cls: '',
  },
  dentro: {
    title: 'Dentro da recomendação',
    text: (m) => `${dec(m.leq)} dB(A), abaixo dos ${OMS_SALA_DBA} dB(A) que a OMS recomenda para sala de aula, mesmo considerando a margem de erro.`,
    cls: 'text-calmo',
  },
  'na-margem': {
    title: 'Perto do limite',
    text: (m) =>
      `${dec(m.leq)} dB(A). A diferença para os ${OMS_SALA_DBA} dB(A) da OMS cabe na margem de erro do aparelho (±${m.calibration?.margin} dB): não dá para afirmar se está acima ou abaixo.`,
    cls: 'text-atencao',
  },
  acima: {
    title: 'Acima da recomendação',
    text: (m) =>
      `${dec(m.leq)} dB(A), ${dec(m.leq - OMS_SALA_DBA, 0)} dB acima dos ${OMS_SALA_DBA} dB(A) da OMS. Com a sala vazia já tem barulho competindo com a voz.`,
    cls: 'text-alto',
  },
  'bem-acima': {
    title: 'Bem acima da recomendação',
    text: (m) =>
      `${dec(m.leq)} dB(A), ${dec(m.leq - OMS_SALA_DBA, 0)} dB acima dos ${OMS_SALA_DBA} dB(A) da OMS. É um problema do ambiente, não da turma: vale levar à direção.`,
    cls: 'text-alto',
  },
}

const CHARACTER = {
  constante:
    'Ruído constante: o nível quase não varia. Costuma vir de ventilador, ar-condicionado, motor ou trânsito contínuo.',
  intermitente:
    'Ruído intermitente: há picos bem acima do fundo. Costuma vir do pátio, corredor, portas, buzinas ou obras.',
}

function fileName(m: RoomMeasurement) {
  const d = new Date(m.createdAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const slug = m.sala.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
  return `sala-vazia_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}h${pad(d.getMinutes())}${slug ? '_' + slug : ''}.json`
}

function RoomChart({ m }: { m: RoomMeasurement }) {
  const W = 420
  const H = 130
  const padL = m.calibration ? 26 : 6
  const padR = 62
  const s = m.serie
  if (s.length < 2) return null
  let lo = Math.min(...s, m.calibration ? OMS_SALA_DBA - 5 : Infinity)
  let hi = Math.max(...s, m.calibration ? OMS_SALA_DBA + 5 : -Infinity)
  lo = Math.floor(lo / 5) * 5
  hi = Math.ceil(hi / 5) * 5
  const y = (v: number) => 10 + (H - 30) * (1 - (v - lo) / (hi - lo))
  const x = (i: number) => padL + (i / (s.length - 1)) * (W - padL - padR)
  const d = s.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return (
    <figure class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Nível da sala vazia, segundo a segundo, durante ${m.durationS} segundos`}>
        {m.calibration && (
          <>
            <line x1={padL} x2={W - padR} y1={y(OMS_SALA_DBA)} y2={y(OMS_SALA_DBA)} class="th th-calmo" />
            <text x={W - padR + 6} y={y(OMS_SALA_DBA) + 4} class="th-label th-label-calmo">
              {OMS_SALA_DBA} · OMS
            </text>
            <text x={padL - 5} y={y(hi) + 4} class="axis" text-anchor="end">
              {hi}
            </text>
            <text x={padL - 5} y={y(lo) + 4} class="axis" text-anchor="end">
              {lo}
            </text>
          </>
        )}
        <line x1={padL} x2={W - padR} y1={y(m.l90)} y2={y(m.l90)} class="grid" />
        <text x={W - padR + 6} y={y(m.l90) + (Math.abs(y(m.l90) - y(OMS_SALA_DBA)) < 14 ? 16 : 4)} class="axis">
          fundo
        </text>
        <path d={d} class="line" />
        <text x={padL} y={H - 4} class="axis">
          0 s
        </text>
        <text x={W - padR} y={H - 4} class="axis" text-anchor="end">
          {m.durationS} s
        </text>
      </svg>
    </figure>
  )
}

function Result({ m, onDelete }: { m: RoomMeasurement; onDelete?: () => void }) {
  const v = roomVerdict(m)
  const info = VERDICT[v]
  const char = noiseCharacter(m)
  const cal = !!m.calibration
  return (
    <article class="room-result">
      <header>
        <p class="eyebrow">
          {dateShort(m.createdAt)} · {hhmm(m.createdAt)} · {m.durationS} s
        </p>
        <h3>{m.sala || 'Sala sem nome'}</h3>
      </header>
      <p class={`room-verdict ${info.cls}`}>{info.title}</p>
      <p>{info.text(m)}</p>
      <dl class="figures room-figures">
        <div>
          <dt>Média (Leq)</dt>
          <dd class="num">{cal ? <>{dec(m.leq)} <small>dB(A)</small></> : '—'}</dd>
        </div>
        <div>
          <dt>Fundo (L90)</dt>
          <dd class="num">{cal ? <>{dec(m.l90)} <small>dB(A)</small></> : '—'}</dd>
        </div>
        <div>
          <dt>Picos (L10 − L90)</dt>
          <dd class="num">
            {dec(m.l10 - m.l90)} <small>dB</small>
          </dd>
        </div>
        <div>
          <dt>Margem</dt>
          <dd class="num">{cal ? <>±{m.calibration!.margin} <small>dB</small></> : <small>sem calibração</small>}</dd>
        </div>
      </dl>
      <RoomChart m={m} />
      <p class="small">{CHARACTER[char]}</p>
      {m.condicoes.length > 0 && (
        <p class="small soft">
          Condições: {m.condicoes.map((c) => CONDICOES.find((x) => x.id === c)?.label.toLowerCase()).join(', ')}.
        </p>
      )}
      <div class="row no-print">
        <button class="btn" onClick={() => download(fileName(m), JSON.stringify(roomToExport(m)), 'application/json')}>
          <IconDownload /> Arquivo para a escola (JSON)
        </button>
        {onDelete && (
          <button class="btn btn-quiet" onClick={onDelete}>
            Apagar
          </button>
        )}
      </div>
    </article>
  )
}

export function EmptyRoom() {
  const st = useStore(settings)
  const l = useStore(lesson)
  const [sala, setSala] = useState('')
  const [secs, setSecs] = useState(60)
  const [cond, setCond] = useState<CondicaoId[]>([])
  const [phase, setPhase] = useState<'pronto' | 'medindo'>('pronto')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [last, setLast] = useState<RoomMeasurement | null>(null)
  const [history, setHistory] = useState<RoomMeasurement[]>([])
  const abort = useRef<AbortController | null>(null)

  const reload = () => listRooms().then(setHistory, () => setHistory([]))
  useEffect(() => {
    void reload()
    return () => abort.current?.abort()
  }, [])

  const toggle = (id: CondicaoId) => setCond((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))

  const run = async () => {
    setError('')
    setLast(null)
    setPhase('medindo')
    setProgress(0)
    abort.current = new AbortController()
    try {
      const dbfs = await measureWindows(secs, (f) => setProgress(Math.min(1, f)), abort.current.signal)
      const m = makeRoomMeasurement({ sala, dbfs, windowMs: WINDOW_MS, calibration: settings.get().calibration, condicoes: cond })
      await saveRoom(m)
      setLast(m)
      void reload()
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') {
        setError(e instanceof MeterError || e instanceof Error ? e.message : 'Não deu certo. Tente de novo.')
      }
    } finally {
      setPhase('pronto')
    }
  }

  const older = history.filter((h) => h.id !== last?.id)

  return (
    <div class="empty-room">
      <LessonsTabs current="salas" />
      <h1>Sala vazia</h1>
      <p class="lead">
        Mede o barulho que a sala tem sem ninguém dentro: ventilador, pátio, rua, a aula da sala ao lado. Separa o que é problema do
        prédio do que é comportamento da turma.
      </p>

      {l.session ? (
        <p class="note">Há uma aula em andamento. Encerre a aula para medir a sala vazia.</p>
      ) : (
        <div class="room-form">
          {!st.calibration && (
            <p class="note note-warn small">
              Sem calibração, o app mede, mas não consegue comparar com os {OMS_SALA_DBA} dB(A) da OMS.{' '}
              <a href="#/calibrar">Calibrar este aparelho</a>
            </p>
          )}
          <div class="field">
            <label for="sala">
              Qual sala? <span class="hint">ex.: Sala 12, Laboratório, 2º andar fundos</span>
            </label>
            <input id="sala" type="text" autocomplete="off" value={sala} onInput={(e) => setSala(e.currentTarget.value)} />
          </div>
          <fieldset class="methods">
            <legend>Como a sala está agora?</legend>
            <p class="small soft">Marque o que vale. Ajuda a entender o resultado e a comparar medições.</p>
            {CONDICOES.map((c) => (
              <label key={c.id} class="check">
                <input type="checkbox" checked={cond.includes(c.id)} onChange={() => toggle(c.id)} />
                {c.label}
              </label>
            ))}
          </fieldset>
          <div class="field">
            <label for="dur">Duração</label>
            <select id="dur" value={secs} onChange={(e) => setSecs(Number(e.currentTarget.value))}>
              <option value={60}>1 minuto</option>
              <option value={120}>2 minutos (melhor se há ruído que vai e volta)</option>
            </select>
          </div>
          <ol class="steps small">
            <li>Deixe o celular sobre uma mesa no meio da sala.</li>
            <li>Saia da sala ou fique em silêncio, sem mexer no aparelho.</li>
            <li>Não deixe a tela apagar: a medição para se o app sair da tela.</li>
          </ol>
          {phase === 'medindo' ? (
            <div class="cal-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Medindo a sala vazia">
              <span style={{ width: `${progress * 100}%` }} />
              <p class="small">
                Medindo… faltam <span class="num">{Math.max(0, Math.ceil(secs * (1 - progress)))}</span> s.{' '}
                <button class="btn btn-quiet" onClick={() => abort.current?.abort()}>
                  Cancelar
                </button>
              </p>
            </div>
          ) : (
            <button class="btn btn-primary btn-big" onClick={run}>
              Medir {secs === 60 ? '1 minuto' : '2 minutos'}
            </button>
          )}
          {error && (
            <p class="note note-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {last && (
        <section aria-live="polite">
          <h2>Resultado</h2>
          <Result m={last} />
        </section>
      )}

      {older.length > 0 && (
        <section>
          <h2>Medições anteriores</h2>
          {older.map((m) => (
            <Result
              key={m.id}
              m={m}
              onDelete={async () => {
                await deleteRoom(m.id)
                void reload()
              }}
            />
          ))}
        </section>
      )}

      <section class="small soft">
        <h2>Sobre a referência</h2>
        <p>
          A OMS recomenda até {OMS_SALA_DBA} dB(A) de ruído de fundo em sala de aula, para que a voz do professor seja entendida sem
          esforço. A ABNT NBR 10152:2017 também traz valores para salas de aula; não conferimos a tabela original da norma.{' '}
          <a href="#/ajustes">Fontes</a>
        </p>
        <p>
          Medição com celular não substitui laudo acústico. Serve para mostrar onde vale a pena chamar um técnico.
        </p>
      </section>
    </div>
  )
}
