import { useEffect, useState } from 'preact/hooks'
import {
  closePending,
  continuePending,
  endLesson,
  lesson,
  pauseLesson,
  resumeLesson,
  startLesson,
} from '../state/lesson'
import { settings } from '../state/settings'
import { useStore } from '../state/store'
import { Spark } from '../ui/charts'
import { BAND_HINT, BAND_LABEL, clock, dec } from '../ui/format'
import { BandShape, IconLight, IconPause, IconPlay, IconStop } from '../ui/icons'
import { go } from '../ui/router'
import { isIOS } from '../state/pwa'
import { ACTIVITIES } from '../lib/activities'
import { markActivity } from '../state/lesson'

/** "O que está acontecendo agora?" — marca o momento da aula. */
function ActivityPicker() {
  const l = useStore(lesson)
  return (
    <fieldset class="activities">
      <legend>O que está acontecendo agora?</legend>
      <div class="activity-row">
        {ACTIVITIES.map((a) => (
          <button
            key={a.id}
            type="button"
            class="activity-btn"
            aria-pressed={l.activity === a.id}
            title={a.hint}
            onClick={() => markActivity(a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <p class="small soft">
        Opcional. Um toque marca o início do momento; vale até o próximo. Tocou errado? Toque no certo em até 10 segundos.
      </p>
    </fieldset>
  )
}

function Elapsed({ since }: { since: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return <span class="num">{clock(Date.now() - since)}</span>
}

function StartForm() {
  const s = useStore(settings)
  const l = useStore(lesson)
  const [turma, setTurma] = useState(s.ultimaTurma)
  const [disc, setDisc] = useState(s.ultimaDisciplina)
  const busy = l.status === 'iniciando'

  const submit = async (e: Event) => {
    e.preventDefault()
    await startLesson(turma, disc)
  }

  return (
    <div class="measure-start">
      {l.pendente && <Pending />}
      <div class="measure-intro">
        <h1>Nova aula</h1>
        <p class="lead">Deixe o celular na mesa, com a tela ligada, longe da sua boca e de janelas.</p>
        {!s.calibration && (
          <p class="note note-warn small">
            Este aparelho ainda não foi calibrado. As faixas funcionam, mas os valores serão <strong>relativos</strong>,
            sem dB. <a href="#/calibrar">Calibrar em 30 segundos</a>
          </p>
        )}
      </div>
      <form class="measure-form" onSubmit={submit}>
        <div class="field">
          <label for="turma">
            Turma <span class="hint">opcional · ex.: 7º B, 2ª série EM</span>
          </label>
          <input id="turma" type="text" autocomplete="off" value={turma} onInput={(e) => setTurma(e.currentTarget.value)} />
        </div>
        <div class="field">
          <label for="disc">
            Disciplina <span class="hint">opcional</span>
          </label>
          <input id="disc" type="text" autocomplete="off" value={disc} onInput={(e) => setDisc(e.currentTarget.value)} />
        </div>
        <button class="btn btn-primary btn-big" type="submit" disabled={busy}>
          <IconPlay /> {busy ? 'Ligando o microfone…' : 'Começar a medir'}
        </button>
        <p class="small">
          Antes da primeira aula numa sala nova, vale <a href="#/sala-vazia">medir a sala vazia</a>: mostra quanto do barulho é do prédio.
        </p>
        <p class="small soft">
          O microfone só mede o nível do som. Nada é gravado nem enviado.{' '}
          {isIOS && 'No iPhone, mantenha o app aberto: o Safari desliga o microfone quando a tela sai do app.'}
        </p>
      </form>
      {l.error && (
        <div class="note note-error" role="alert">
          <p>{l.error.message}</p>
        </div>
      )}
    </div>
  )
}

function Pending() {
  const p = useStore(lesson).pendente!
  return (
    <div class="note note-warn" role="status">
      <p>
        A aula {p.turma && <strong>{p.turma}</strong>} de {new Date(p.startedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} não foi
        encerrada (o app fechou no meio).
      </p>
      <div class="row">
        <button class="btn" onClick={() => void continuePending()}>
          Continuar essa aula
        </button>
        <button
          class="btn btn-quiet"
          onClick={async () => {
            const id = await closePending()
            if (id) go(`aula/${id}`)
          }}
        >
          Encerrar e ver relatório
        </button>
      </div>
    </div>
  )
}

export function Measure() {
  const l = useStore(lesson)
  const s = l.session
  if (!s) return <StartForm />

  const cal = s.calibration
  const band = l.band
  const confirmEnd = async () => {
    const id = await endLesson()
    if (id) go(`aula/${id}`)
  }

  return (
    <div class="measure-live">
      <div class="live-head">
        <p class="live-title">
          {[s.turma, s.disciplina].filter(Boolean).join(' · ') || 'Aula sem nome'}
          <span class="soft"> · desde {new Date(s.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        </p>
        <p class="small">
          <Elapsed since={s.startedAt} /> de aula ·{' '}
          {cal ? <span class="tag tag-cal">calibrado ±{cal.margin} dB</span> : <span class="tag tag-rel">relativo</span>}
        </p>
      </div>

      <section class={`reading ${band ? 'reading-' + band : ''}`} aria-live="polite" aria-atomic="true">
        {l.status === 'pausado' ? (
          <p class="reading-paused">Medição pausada.</p>
        ) : l.status === 'interrompido' || l.level === null ? (
          <p class="reading-paused">{l.status === 'interrompido' ? 'Religando o microfone…' : 'Ouvindo…'}</p>
        ) : (
          <>
            <div class="reading-band">
              <BandShape band={band!} size={44} />
              <span>{BAND_LABEL[band!]}</span>
            </div>
            {cal ? (
              <p class="reading-value num">
                {dec(l.level, 0)}
                <span class="unit">dB(A)</span>
              </p>
            ) : (
              <RelativeScale level={l.level} />
            )}
            <p class="reading-hint">{BAND_HINT[band!]}</p>
          </>
        )}
      </section>

      <div class="live-spark">
        <Spark values={l.recent} thresholds={s.thresholds} />
        <p class="small soft">Últimos 2 minutos</p>
      </div>

      <div class="controls">
        {l.status === 'pausado' ? (
          <button class="btn btn-primary btn-big" onClick={() => void resumeLesson()}>
            <IconPlay /> Retomar
          </button>
        ) : (
          <button class="btn btn-big" onClick={() => void pauseLesson()} disabled={l.status === 'iniciando'}>
            <IconPause /> Pausar
          </button>
        )}
        <button class="btn btn-big" onClick={confirmEnd}>
          <IconStop /> Encerrar aula
        </button>
        <a class="btn btn-quiet" href="#/semaforo">
          <IconLight /> Projetar semáforo
        </a>
      </div>

      <ActivityPicker />

      {l.error && (
        <div class="note note-error" role="alert">
          <p>{l.error.message}</p>
          <button class="btn" onClick={() => void resumeLesson()}>
            Tentar de novo
          </button>
        </div>
      )}

      <aside class="desk small">
        <h2 class="desk-title">Modo mesa</h2>
        <ul>
          <li>
            {l.wakeLock === 'ativo'
              ? 'Tela mantida ligada.'
              : 'Este navegador não mantém a tela ligada sozinho: aumente o tempo de bloqueio da tela nos ajustes do aparelho.'}
          </li>
          {l.bateriaBaixa && <li class="warn">Bateria abaixo de 20%. Ligue o carregador para não perder o fim da aula.</li>}
          <li>Se o microfone parar (ligação, outro app), o app tenta religar sozinho e marca o intervalo como “sem medição”.</li>
          {isIOS && <li>iPhone: não troque de app durante a aula. O Safari pausa o microfone em segundo plano.</li>}
        </ul>
      </aside>
    </div>
  )
}

/** Sem calibração: régua de faixas, sem número em dB. */
function RelativeScale({ level }: { level: number }) {
  const t = useStore(lesson).session!.thresholds
  const lo = t.calmoAte - 15
  const hi = t.altoDesde + 10
  const pos = Math.min(100, Math.max(0, ((level - lo) / (hi - lo)) * 100))
  const c = ((t.calmoAte - lo) / (hi - lo)) * 100
  const a = ((t.altoDesde - lo) / (hi - lo)) * 100
  return (
    <div class="relscale" role="img" aria-label="Posição relativa do nível nas faixas">
      <div class="relscale-track">
        <span class="bg-calmo" style={{ width: `${c}%` }} />
        <span class="bg-atencao" style={{ width: `${a - c}%` }} />
        <span class="bg-alto" style={{ width: `${100 - a}%` }} />
      </div>
      <span class="relscale-mark" style={{ left: `${pos}%` }} />
      <p class="small soft">Valor relativo. Calibre o aparelho para ver dB(A).</p>
    </div>
  )
}
