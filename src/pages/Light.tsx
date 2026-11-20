/**
 * Semáforo em tela cheia, para projetar. Texto + forma + cor.
 * Meta positiva: acumula tempo na faixa calma; nunca desconta.
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import { lesson, startLesson } from '../state/lesson'
import { settings } from '../state/settings'
import { useStore } from '../state/store'
import { BAND_LABEL, clock } from '../ui/format'
import { BandShape, IconBack, IconExpand, IconMute, IconSound } from '../ui/icons'
import type { Band } from '../lib/session'

const MESSAGE: Record<Band, string> = {
  calmo: 'Assim dá para todo mundo ouvir.',
  atencao: 'Vamos baixar um pouco.',
  alto: 'Hora de voltar ao tom de sala.',
}

/** Toque suave (duas notas), só quando a meta é cumprida. */
function chime() {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime
    ;[523.25, 659.25].forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0, now + i * 0.35)
      g.gain.linearRampToValueAtTime(0.12, now + i * 0.35 + 0.05)
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.35 + 1.4)
      o.connect(g).connect(ctx.destination)
      o.start(now + i * 0.35)
      o.stop(now + i * 0.35 + 1.5)
    })
    setTimeout(() => ctx.close(), 2500)
  } catch {
    /* sem áudio: tudo bem */
  }
}

export function Light() {
  const l = useStore(lesson)
  const s = useStore(settings)
  const [calmMs, setCalmMs] = useState(0)
  const [done, setDone] = useState(false)
  const [controls, setControls] = useState(true)
  const last = useRef(Date.now())
  const hideTimer = useRef<number | undefined>(undefined)

  const band = l.lightBand
  const goalMs = s.metaMinutos * 60_000

  // Acumula tempo calmo enquanto mede.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now()
      const dt = now - last.current
      last.current = now
      const st = lesson.get()
      if (st.status === 'medindo' && st.lightBand === 'calmo') {
        setCalmMs((c) => c + dt)
      }
    }, 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!done && goalMs > 0 && calmMs >= goalMs) {
      setDone(true)
      if (!settings.get().mudo) chime()
    }
  }, [calmMs, goalMs, done])

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
    const el = document.documentElement
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.().catch(() => {})
  }

  const progress = goalMs ? Math.min(1, calmMs / goalMs) : 0

  return (
    <div class={`light ${band ? 'light-' + band : 'light-idle'} ${controls ? '' : 'light-hide'}`} onPointerMove={poke} onClick={poke}>
      <div class="light-bar">
        <a href="#/medir" class="btn light-btn">
          <IconBack /> Sair
        </a>
        <div class="light-bar-right">
          <button
            class="btn light-btn"
            aria-pressed={!s.mudo}
            aria-label={s.mudo ? 'Som desligado. Ligar som da meta' : 'Som da meta ligado. Desligar'}
            onClick={() => settings.set({ mudo: !s.mudo })}
          >
            {s.mudo ? <IconMute /> : <IconSound />}
          </button>
          <button class="btn light-btn" onClick={fullscreen} aria-label="Tela cheia">
            <IconExpand />
          </button>
        </div>
      </div>

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

      {l.session && goalMs > 0 && (
        <div class="light-goal">
          {done ? (
            <p class="light-goal-text">
              Meta cumprida: {s.metaMinutos} minutos de sala calma.
            </p>
          ) : (
            <p class="light-goal-text">
              Meta da turma: {s.metaMinutos} min na faixa calma ·{' '}
              <span class="num">{clock(calmMs)}</span>
            </p>
          )}
          <div class="light-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Progresso da meta">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}
