/** Toque suave (duas notas). Nunca toca com "Silenciar sons" ligado. */
import { settings } from '../state/settings'

export function chime() {
  if (settings.get().mudo) return
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
