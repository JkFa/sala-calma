/**
 * Lembrete de pausa vocal: conta o tempo SEGUIDO em que o ruído de fundo
 * (L90 móvel de 10 s) fica acima do limiar de esforço vocal.
 *
 * - Abaixo do limiar por pouco tempo (< 1 min): a contagem só para.
 * - Abaixo do limiar por 1 min ou mais (ou lacuna desse tamanho): zera.
 * - Ao passar de N minutos seguidos, sugere uma pausa; a próxima sugestão
 *   só depois de mais N minutos na mesma sequência.
 *
 * É um lembrete de autocuidado, não um diagnóstico.
 */
import { applyOffset } from './calibration'
import { rollingL90 } from './levels'
import { VOCAL_SPAN_MS, type Session } from './session'

export const QUIET_RESET_MS = 60_000

export interface StreakConfig {
  threshold: number
  /** 0 = lembrete desligado. */
  alertAfterMs: number
  quietResetMs?: number
}

export class VocalStreak {
  streakMs = 0
  longestMs = 0
  private quietMs = 0
  private nextAlertAt: number
  private cfg: Required<StreakConfig>

  constructor(cfg: StreakConfig) {
    this.cfg = { quietResetMs: QUIET_RESET_MS, ...cfg }
    this.nextAlertAt = this.cfg.alertAfterMs
  }

  private reset() {
    this.streakMs = 0
    this.quietMs = 0
    this.nextAlertAt = this.cfg.alertAfterMs
  }

  /** Uma janela de medição. Devolve true quando é hora de sugerir pausa. */
  update(background: number, dtMs: number): boolean {
    if (background > this.cfg.threshold) {
      this.quietMs = 0
      this.streakMs += dtMs
      if (this.streakMs > this.longestMs) this.longestMs = this.streakMs
      if (this.cfg.alertAfterMs > 0 && this.streakMs >= this.nextAlertAt) {
        this.nextAlertAt += this.cfg.alertAfterMs
        return true
      }
      return false
    }
    this.quietMs += dtMs
    if (this.quietMs >= this.cfg.quietResetMs) this.reset()
    return false
  }

  /** Período sem medição (pausa, interrupção). Longo o bastante, zera. */
  gap(ms: number) {
    this.quietMs += ms
    if (this.quietMs >= this.cfg.quietResetMs) this.reset()
  }
}

export interface StreakSummary {
  longestMs: number
  /** Instantes em que o lembrete apareceria com esta configuração. */
  alerts: number[]
}

/** Recalcula as sequências de uma aula já gravada (vale para aulas antigas). */
export function analyzeStreaks(session: Session, alertAfterMs: number): StreakSummary {
  const w = session.windowMs
  const span = Math.round(VOCAL_SPAN_MS / w)
  const st = new VocalStreak({ threshold: session.thresholds.esforcoVocal, alertAfterMs })
  const alerts: number[] = []
  let prevEnd: number | null = null
  for (const seg of session.segments) {
    if (prevEnd !== null) st.gap(Math.max(0, seg.start - prevEnd))
    const bg = rollingL90(
      seg.levels.map((v) => applyOffset(v, session.calibration)),
      span,
    )
    for (let i = 0; i < bg.length; i++) {
      if (st.update(bg[i], w)) alerts.push(seg.start + (i + 1) * w)
    }
    prevEnd = seg.start + seg.levels.length * w
  }
  return { longestMs: st.longestMs, alerts }
}

export const BREAK_TIPS = [
  'Um gole d’água e meio minuto de silêncio seu.',
  'Passe a palavra: uma atividade em que a turma fala e você ouve.',
  'Use um sinal combinado (mão levantada, palmas) em vez de falar mais alto.',
  'Aproxime-se de quem está falando em vez de projetar a voz.',
]
