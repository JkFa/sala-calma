/** Instalação (Android/desktop e iOS) e aviso de atualização. */
import { createStore } from './store'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface PwaState {
  canInstall: boolean
  installed: boolean
  ios: boolean
  needRefresh: boolean
  offlineReady: boolean
}

const ua = navigator.userAgent
export const isIOS =
  /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export const pwa = createStore<PwaState>({
  canInstall: false,
  installed: isStandalone,
  ios: isIOS,
  needRefresh: false,
  offlineReady: false,
})

let deferred: BeforeInstallPromptEvent | null = null

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
  pwa.set({ canInstall: true })
})

window.addEventListener('appinstalled', () => {
  deferred = null
  pwa.set({ canInstall: false, installed: true })
})

export async function promptInstall() {
  if (!deferred) return
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  pwa.set({ canInstall: false, installed: outcome === 'accepted' })
}

let updateSW: ((reload?: boolean) => Promise<void>) | null = null

export async function registerSW() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  const { registerSW } = await import('virtual:pwa-register')
  updateSW = registerSW({
    onNeedRefresh: () => pwa.set({ needRefresh: true }),
    onOfflineReady: () => pwa.set({ offlineReady: true }),
    onRegisteredSW(_url, reg) {
      // Procura versão nova a cada hora, sem interromper nada.
      if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
    },
  })
}

export function applyUpdate() {
  void updateSW?.(true)
}
