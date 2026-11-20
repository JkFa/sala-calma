/**
 * Preferências do professor, guardadas no próprio aparelho (localStorage).
 */
import { DEFAULT_THRESHOLDS } from '../config'
import type { Calibration } from '../lib/calibration'
import type { Thresholds } from '../lib/session'
import { createStore } from './store'

export type Theme = 'auto' | 'claro' | 'escuro'

export interface Settings {
  thresholds: Thresholds
  calibration: Calibration | null
  theme: Theme
  /** Silencia qualquer som do app. */
  mudo: boolean
  /** Meta do semáforo, em minutos na faixa calma. */
  metaMinutos: number
  ultimaTurma: string
  ultimaDisciplina: string
  /** Já viu a instrução de posicionamento. */
  viuDicaMesa: boolean
}

const KEY = 'sala-calma:ajustes'

export const DEFAULT_SETTINGS: Settings = {
  thresholds: { ...DEFAULT_THRESHOLDS },
  calibration: null,
  theme: 'auto',
  mudo: false,
  metaMinutos: 10,
  ultimaTurma: '',
  ultimaDisciplina: '',
  viuDicaMesa: false,
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const s = JSON.parse(raw) as Partial<Settings>
    return { ...DEFAULT_SETTINGS, ...s, thresholds: { ...DEFAULT_THRESHOLDS, ...s.thresholds } }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export const settings = createStore<Settings>(load())

settings.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* armazenamento cheio ou bloqueado: segue sem salvar */
  }
  applyTheme(s.theme)
})

export function applyTheme(t: Theme) {
  const root = document.documentElement
  if (t === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t === 'escuro' ? 'dark' : 'light')
}
