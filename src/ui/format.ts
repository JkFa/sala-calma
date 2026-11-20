import type { Band } from '../lib/session'

export const BAND_LABEL: Record<Band, string> = {
  calmo: 'Calmo',
  atencao: 'Atenção',
  alto: 'Alto',
}

export const BAND_HINT: Record<Band, string> = {
  calmo: 'Dá para falar sem forçar a voz.',
  atencao: 'A conversa paralela começou a competir com a aula.',
  alto: 'Nesse nível a voz tende a subir para ser ouvida.',
}

export function dur(ms: number): string {
  const totalMin = Math.round(ms / 60000)
  if (ms < 60000) return `${Math.round(ms / 1000)} s`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

export function clock(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const mm = String(m).padStart(2, '0')
  return h ? `${h}:${mm}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`
}

export const dec = (n: number, d = 1) =>
  Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'

export const hhmm = (t: number) =>
  new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export const dateLong = (t: number) =>
  new Date(t).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export const dateShort = (t: number) =>
  new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
