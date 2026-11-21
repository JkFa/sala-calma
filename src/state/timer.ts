/** Cronômetro do semáforo: sobrevive a sair e voltar da tela. */
import { extend, startCountdown, view, type Countdown } from '../lib/timer'
import { chime } from '../ui/chime'
import { createStore } from './store'

export interface TimerState {
  countdown: Countdown | null
  /** Quando terminou (para mostrar "Tempo!" por alguns segundos). */
  doneAt: number | null
}

export const timer = createStore<TimerState>({ countdown: null, doneAt: null })

let tick: number | null = null

function ensureTick() {
  if (tick !== null) return
  tick = window.setInterval(() => {
    const { countdown, doneAt } = timer.get()
    const now = Date.now()
    if (countdown && view(countdown, now).done && doneAt === null) {
      timer.set({ doneAt: now })
      chime()
    }
    // Some com o "Tempo!" depois de 15 s.
    if (doneAt !== null && now - doneAt > 15_000) {
      timer.set({ countdown: null, doneAt: null })
    }
    if (!timer.get().countdown && tick !== null) {
      clearInterval(tick)
      tick = null
    }
  }, 250)
}

export function startTimer(minutes: number, label: string) {
  timer.set({ countdown: startCountdown(minutes, label), doneAt: null })
  ensureTick()
}

export function addMinute() {
  const c = timer.get().countdown
  if (!c) return
  timer.set({ countdown: extend(c, 60_000), doneAt: null })
  ensureTick()
}

export function stopTimer() {
  timer.set({ countdown: null, doneAt: null })
}
