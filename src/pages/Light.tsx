/**
 * Semáforo em tela cheia, para projetar. Texto + forma + cor.
 * Meta positiva: acumula tempo na faixa calma; nunca desconta.
 * Extras: cronômetro de atividade, modo sem números e meta da semana.
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import { ACTIVITIES, ACTIVITY_LABEL, type ActivityId } from '../lib/activities'
import { listSessions } from '../lib/db'
import type { Band } from '../lib/session'
import { view } from '../lib/timer'
import { goalDots, weeklyCalmMs } from '../lib/weekly'
import { lesson, markActivity, startLesson } from '../state/lesson'
import { settings } from '../state/settings'
import { useStore } from '../state/store'
import { addMinute, startTimer, stopTimer, timer } from '../state/timer'
import { chime } from '../ui/chime'
import { BAND_LABEL, clock, dur } from '../ui/format'
import { BandShape, IconBack, IconExpand, IconMute, IconSound } from '../ui/icons'

const MESSAGE: Record<Band, string> = {
  calmo: 'Assim dá para todo mundo ouvir.',
  atencao: 'Vamos baixar um pouco.',
  alto: 'Hora de voltar ao tom de sala.',
}

const DURATIONS = [3, 5, 10, 15, 20]

function Dots({ total, filled, label }: { total: number; filled: number; label: string }) {
  return (
    <div class="dots" role="img" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} class={i < filled ? 'dot-on' : ''} />
      ))}
    </div>
  )
}

function Bar({ fraction, label }: { fraction: number; label: string }) {
  return (
    <div class="light-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)} aria-label={label}>
      <span style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} />
    </div>
  )
}

/** Painel para começar o cronômetro. */
function TimerPanel({ onClose }: { onClose: () => void }) {
  const l = useStore(lesson)
  const [min, setMin] = useState(5)
  const [act, setAct] = useState<ActivityId | null>(null)
  return (
    <div class="timer-panel" role="dialog" aria-label="Cronômetro de atividade">
      <p class="timer-panel-title">Cronômetro</p>
      <fieldset>
        <legend>Quanto tempo?</legend>
        <div class="activity-row">
          {DURATIONS.map((d) => (
            <button key={d} type="button" class="activity-btn" aria-pressed={min === d} onClick={() => setMin(d)}>
              {d} min
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Para qual momento? (opcional)</legend>
        <div class="activity-row">
          {ACTIVITIES.map((a) => (
            <button key={a.id} type="button" class="activity-btn" aria-pressed={act === a.id} onClick={() => setAct(act === a.id ? null : a.id)}>
              {a.label}
            </button>
          ))}
        </div>
        {act && l.session && <p class="small">Também marca “{ACTIVITY_LABEL[act]}” no relatório da aula.</p>}
      </fieldset>
      <div class="row">
        <button
          class="btn btn-primary"
          onClick={() => {
            if (act && l.session) markActivity(act)
            startTimer(min, act ? ACTIVITY_LABEL[act] : '')
            onClose()
          }}
        >
          Começar {min} min
        </button>
        <button class="btn btn-quiet" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function TimerDisplay({ semNumeros }: { semNumeros: boolean }) {
  const tm = useStore(timer)
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [])
  const c = tm.countdown
  if (!c) return null
  const v = view(c)
  if (tm.doneAt !== null) {
    return (
      <div class="light-timer" role="status">
        <p class="light-timer-done">Tempo!</p>
        {c.label && <p class="light-timer-label">Acabou o tempo de {c.label.toLowerCase()}.</p>}
      </div>
    )
  }
  return (
    <div class="light-timer" role="timer" aria-label={`${c.label || 'Cronômetro'}: faltam ${v.clock}`}>
      <p class="light-timer-label">{c.label || 'Cronômetro'}</p>
      {!semNumeros && <p class="light-timer-clock num">{v.clock}</p>}
      <Bar fraction={v.fraction} label="Tempo que falta" />
    </div>
  )
}

export function Light() {
  const l = useStore(lesson)
  const s = useStore(settings)
  const tm = useStore(timer)
  const [controls, setControls] = useState(true)
  const [panel, setPanel] = useState(false)
  const [savedWeek, setSavedWeek] = useState(0)
  const hideTimer = useRef<number | undefined>(undefined)
  const chimedFor = useRef<string | null>(null)

  const band = l.lightBand
  const goalMs = s.metaMinutos * 60_000
  const turma = l.session?.turma ?? ''
  const sid = l.session?.id

  // Soma da semana: aulas encerradas desta semana + a aula de agora (ao vivo).
  useEffect(() => {
    if (!turma) return setSavedWeek(0)
    listSessions()
      .then((all) => setSavedWeek(weeklyCalmMs(all, turma, Date.now(), sid)))
      .catch(() => setSavedWeek(0))
  }, [turma, sid])
  const weekMs = savedWeek + l.calmMs
  const weekGoalMs = s.metaSemanalMin * 60_000

  const done = goalMs > 0 && l.calmMs >= goalMs
  useEffect(() => {
    if (done && sid && chimedFor.current !== sid) {
      chimedFor.current = sid
      chime()
    }
  }, [done, sid])

  const poke = () => {
    setControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setControls(false), 4000)
  }
  useEffect(() => {
    poke()
    return () => clearTimeout(hideTimer.current)
  }, [])

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  const progress = goalMs ? Math.min(1, l.calmMs / goalMs) : 0
  const dots = goalDots(l.calmMs, goalMs)

  return (
    <div
      class={`light ${band ? 'light-' + band : 'light-idle'} ${controls || panel ? '' : 'light-hide'} ${s.semaforoSemNumeros ? 'light-nonum' : ''} ${tm.countdown ? 'has-timer' : ''}`}
      onPointerMove={poke}
      onClick={poke}
    >
      <div class="light-bar">
        <a href="#/medir" class="btn light-btn">
          <IconBack /> Sair
        </a>
        <div class="light-bar-right">
          {tm.countdown && tm.doneAt === null ? (
            <>
              <button class="btn light-btn" onClick={addMinute}>
                +1 min
              </button>
              <button class="btn light-btn" onClick={stopTimer}>
                Parar
              </button>
            </>
          ) : (
            <button class="btn light-btn" onClick={() => setPanel(true)}>
              Cronômetro
            </button>
          )}
          <button
            class="btn light-btn"
            aria-pressed={!s.mudo}
            aria-label={s.mudo ? 'Som desligado. Ligar' : 'Som ligado (meta e cronômetro). Desligar'}
            onClick={() => settings.set({ mudo: !s.mudo })}
          >
            {s.mudo ? <IconMute /> : <IconSound />}
          </button>
          <button class="btn light-btn" onClick={fullscreen} aria-label="Tela cheia">
            <IconExpand />
          </button>
        </div>
      </div>

      {panel && <TimerPanel onClose={() => setPanel(false)} />}

      {!l.session ? (
        <div class="light-center">
          <p class="light-word">Semáforo</p>
          <p class="light-msg">Começa uma aula para o semáforo acender.</p>
          <button class="btn btn-big light-start" onClick={() => void startLesson(s.ultimaTurma, s.ultimaDisciplina)}>
            Começar a medir
          </button>
          {l.error && <p role="alert">{l.error.message}</p>}
        </div>
      ) : !band || l.status !== 'medindo' ? (
        <div class="light-center">
          <p class="light-msg">{l.status === 'pausado' ? 'Medição pausada.' : 'Ouvindo a sala…'}</p>
        </div>
      ) : (
        <div class="light-center" role="status" aria-live="polite">
          <BandShape band={band} size={160} />
          <p class="light-word">{BAND_LABEL[band]}</p>
          <p class="light-msg">{MESSAGE[band]}</p>
        </div>
      )}

      <TimerDisplay semNumeros={s.semaforoSemNumeros} />

      {l.session && (goalMs > 0 || turma) && (
        <div class="light-goal">
          {goalMs > 0 &&
            (s.semaforoSemNumeros ? (
              <>
                <p class="light-goal-text">{done ? 'Meta cumprida!' : 'Meta da turma'}</p>
                <Dots total={dots.total} filled={dots.filled} label={`Meta: ${dots.filled} de ${dots.total}`} />
              </>
            ) : (
              <>
                <p class="light-goal-text">
                  {done ? (
                    <>Meta cumprida: {s.metaMinutos} minutos de sala calma.</>
                  ) : (
                    <>
                      Meta da turma: {s.metaMinutos} min na faixa calma · <span class="num">{clock(l.calmMs)}</span>
                    </>
                  )}
                </p>
                <Bar fraction={progress} label="Progresso da meta" />
              </>
            ))}
          {turma &&
            (s.semaforoSemNumeros ? (
              weekGoalMs > 0 && (
                <div class="light-week">
                  <p class="light-week-text">Semana {weekMs >= weekGoalMs ? '— meta cumprida!' : `da turma`}</p>
                  <Bar fraction={weekMs / weekGoalMs} label="Meta da semana" />
                </div>
              )
            ) : (
              <div class="light-week">
                <p class="light-week-text">
                  Esta semana, {turma}: <strong class="num">{dur(weekMs)}</strong> de sala calma
                  {weekGoalMs > 0 && (weekMs >= weekGoalMs ? ' — meta da semana cumprida!' : ` de ${dur(weekGoalMs)}`)}
                </p>
                {weekGoalMs > 0 && <Bar fraction={weekMs / weekGoalMs} label="Meta da semana" />}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
