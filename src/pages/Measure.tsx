import { useEffect, useState } from 'preact/hooks'
import {
  closePending,
  continuePending,
  endLesson,
  lesson,
  pauseLesson,
  removeCalibration,
  resumeLesson,
  startLesson,
} from '../state/lesson'
import { settings } from '../state/settings'
import { useStore } from '../state/store'
import { Gauge, LiveChart, gaugeRange } from '../ui/live'
import { MicPicker } from '../ui/MicPicker'
import { calibracaoSuspeita } from '../lib/calibration'
import { SILENT_MIC_MESSAGE } from '../audio/meter'
import type { MedidorVista } from '../state/settings'
import { BAND_HINT, BAND_LABEL, clock, dec } from '../ui/format'
import { BandShape, IconLight, IconPause, IconPlay, IconStop } from '../ui/icons'
import { go } from '../ui/router'
import { isIOS } from '../state/pwa'
import { WINDOW_MS } from '../config'
import { ACTIVITIES } from '../lib/activities'
import { markActivity, dismissVocalBreak } from '../state/lesson'
import { BREAK_TIPS } from '../lib/vocalbreak'
import { settings as settingsStore } from '../state/settings'

/** Lembrete de pausa vocal: discreto, sem som, sem vibração. */
function VocalBreak() {
  const l = useStore(lesson)
  if (!l.pausaVocal) return null
  const min = Math.floor(l.vocalStreakMs / 60_000)
  return (
    <div class="vocal-break" role="status">
      <p class="vocal-break-title">Hora de uma pausa de voz?</p>
      <p>
        Faz {min} minutos seguidos que o ruído de fundo está acima do nível em que a voz tende a subir. {BREAK_TIPS[l.pausaDica % BREAK_TIPS.length]}
      </p>
      <button class="btn" onClick={dismissVocalBreak}>
        Ok
      </button>
    </div>
  )
}

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
        <MicPicker />
        {calibracaoSuspeita(s.calibration) && <BadCalibration />}
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

      <VocalBreak />

      {l.procurandoMic && (
        <p class="note" role="status">
          O microfone em uso quase não capta som. Testando os outros microfones deste aparelho…
        </p>
      )}
      {l.micTrocado && (
        <div class="note" role="status">
          <p>
            O microfone anterior não estava ouvindo a sala. Passei a usar <strong>{l.micTrocado}</strong>, que está captando o som. A
            escolha ficou salva para as próximas aulas.
          </p>
          <button class="btn btn-quiet" type="button" onClick={() => lesson.set({ micTrocado: null })}>
            Ok
          </button>
        </div>
      )}
      {l.semSinal && !l.procurandoMic && (
        <div class="note note-error" role="alert">
          <p>
            <strong>O microfone não está ouvindo a sala.</strong> {SILENT_MIC_MESSAGE}
          </p>
          <MicPicker />
        </div>
      )}
      {calibracaoSuspeita(cal) && <BadCalibration />}
      {cal?.mic && l.microfone && cal.mic !== l.microfone && (
        <div class="note note-warn" role="status">
          <p>
            Este aparelho foi calibrado com outro microfone ({cal.mic}). Agora está medindo com “{l.microfone}”, então os valores em
            dB(A) não valem. Volte para o microfone da calibração ou <a href="#/calibrar">calibre de novo</a> depois da aula.
          </p>
        </div>
      )}

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

      <LiveView />

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
          <li>
            {settingsStore.get().lembreteVocalMin > 0
              ? l.vocalStreakMs >= 60_000
                ? `Esforço vocal agora: ${Math.floor(l.vocalStreakMs / 60_000)} min seguidos. Lembrete de pausa aos ${settingsStore.get().lembreteVocalMin} min, só nesta tela, sem som.`
                : `Lembrete de pausa de voz após ${settingsStore.get().lembreteVocalMin} min seguidos de esforço vocal, só nesta tela, sem som.`
              : 'Lembrete de pausa de voz desligado (Ajustes).'}
          </li>
          {l.bateriaBaixa && <li class="warn">Bateria abaixo de 20%. Ligue o carregador para não perder o fim da aula.</li>}
          <li>Se o microfone parar (ligação, outro app), o app tenta religar sozinho e marca o intervalo como “sem medição”.</li>
          {isIOS && <li>iPhone: não troque de app durante a aula. O Safari pausa o microfone em segundo plano.</li>}
        </ul>
      </aside>
    </div>
  )
}

/** Calibração feita com o microfone mudo: o valor fica parado (ex.: 35 dB(A)). */
export function BadCalibration() {
  return (
    <div class="note note-warn" role="status">
      <p>
        A calibração deste aparelho foi feita quando o microfone não captava som nenhum. Por isso a leitura pode ficar parada
        (por exemplo, sempre em 35 dB(A)). Remova a calibração e, com o microfone funcionando, calibre de novo.
      </p>
      <div class="row">
        <button class="btn" type="button" onClick={removeCalibration}>
          Remover calibração
        </button>
        <a class="btn btn-quiet" href="#/calibrar">
          Calibrar de novo
        </a>
      </div>
    </div>
  )
}

const VISTAS: { id: MedidorVista; label: string }[] = [
  { id: 'grafico', label: 'Gráfico' },
  { id: 'ponteiros', label: 'Ponteiros' },
  { id: 'ambos', label: 'Os dois' },
]
const JANELAS = [
  { s: 30, label: '30 s' },
  { s: 120, label: '2 min' },
  { s: 600, label: '10 min' },
]

/** Gráfico ao vivo e/ou medidores de ponteiro, à escolha do professor. */
function LiveView() {
  const l = useStore(lesson)
  const st = useStore(settings)
  const s = l.session!
  const cal = s.calibration !== null
  const vista = st.medidorVista
  const janela = st.graficoJanelaS
  const showChart = vista !== 'ponteiros'
  const showGauges = vista !== 'grafico'

  // 30 s: uma leitura a cada 125 ms (mostra cada oscilação). 2 e 10 min: 1 ponto por segundo.
  const chartValues = janela <= 30 ? l.wave : l.recent.slice(-janela)
  const chartStep = janela <= 30 ? WINDOW_MS : 1000
  const live = l.status === 'medindo'
  const range = gaugeRange([...l.recent.slice(-120), ...l.wave])
  // "Agora" segue cada leitura de 125 ms, como um medidor em resposta rápida.
  const now = live && l.wave.length ? l.wave[l.wave.length - 1] : null
  const peakWin = l.wave.slice(-Math.round(10_000 / WINDOW_MS))
  const peak = peakWin.length ? Math.max(...peakWin) : null

  return (
    <section class="live-view" aria-label="Nível ao vivo">
      <div class="live-options">
        <div class="seg" role="group" aria-label="Mostrar">
          {VISTAS.map((v) => (
            <button key={v.id} type="button" class="seg-btn" aria-pressed={vista === v.id} onClick={() => settings.set({ medidorVista: v.id })}>
              {v.label}
            </button>
          ))}
        </div>
        {showChart && (
          <div class="seg" role="group" aria-label="Período do gráfico">
            {JANELAS.map((j) => (
              <button key={j.s} type="button" class="seg-btn" aria-pressed={janela === j.s} onClick={() => settings.set({ graficoJanelaS: j.s })}>
                {j.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {showGauges && (
        <div class="gauges">
          <Gauge label="Agora" value={now} peak={live ? peak : null} {...range} thresholds={s.thresholds} calibrated={cal} />
          <Gauge label="Média de 3 s (semáforo)" value={live ? l.slow : null} {...range} thresholds={s.thresholds} calibrated={cal} />
          <Gauge label="Média da aula (Leq)" value={l.leqAula} {...range} thresholds={s.thresholds} calibrated={cal} />
        </div>
      )}
      {!l.semSinal && <MicPicker />}
      {showChart && <LiveChart values={chartValues} stepMs={chartStep} thresholds={s.thresholds} calibrated={cal} />}
    </section>
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
