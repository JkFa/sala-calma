/**
 * Ícones próprios: grade de 24 px, traço de 1,75, pontas arredondadas.
 * Poucos e consistentes.
 */
import type { ComponentChildren } from 'preact'

type P = { size?: number; title?: string; class?: string }

function Svg({ size = 22, title, children, ...rest }: P & { children: ComponentChildren }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  )
}

export const IconMic = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
  </Svg>
)

export const IconPause = (p: P) => (
  <Svg {...p}>
    <path d="M9 5v14M15 5v14" />
  </Svg>
)

export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M7 4.5v15l12-7.5z" />
  </Svg>
)

export const IconStop = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </Svg>
)

/** Semáforo: três formas (círculo, triângulo, quadrado). */
export const IconLight = (p: P) => (
  <Svg {...p}>
    <circle cx="6" cy="17" r="3" />
    <path d="M12 3.5l3.2 5.5H8.8z" />
    <rect x="15.5" y="13.5" width="6" height="6" rx="0.5" />
  </Svg>
)

/** Caderno com linhas: aulas / relatórios. */
export const IconNotebook = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h12v18H6zM9 3v18M12 8h3.5M12 12h3.5M12 16h3.5" />
  </Svg>
)

/** Escola: prédio simples com frontão. */
export const IconSchool = (p: P) => (
  <Svg {...p}>
    <path d="M3 10l9-6 9 6M5 10v10h14V10M10 20v-5h4v5" />
  </Svg>
)

/** Ajustes: dois controles deslizantes. */
export const IconSliders = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Svg>
)

/** Compartilhar do iOS: quadrado aberto com seta para cima. */
export const IconShareIOS = (p: P) => (
  <Svg {...p}>
    <path d="M8 9H6.5A1.5 1.5 0 0 0 5 10.5v8A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 9H16M12 14V3M8.5 6.5L12 3l3.5 3.5" />
  </Svg>
)

/** Adicionar à Tela de Início: quadrado com +. */
export const IconAddSquare = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M12 8.5v7M8.5 12h7" />
  </Svg>
)

export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />
  </Svg>
)

export const IconPrint = (p: P) => (
  <Svg {...p}>
    <path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z" />
  </Svg>
)

export const IconExpand = (p: P) => (
  <Svg {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Svg>
)

export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)

export const IconSound = (p: P) => (
  <Svg {...p}>
    <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" />
  </Svg>
)

export const IconMute = (p: P) => (
  <Svg {...p}>
    <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4zM16 10l4 4M20 10l-4 4" />
  </Svg>
)

export const IconBack = (p: P) => (
  <Svg {...p}>
    <path d="M14.5 6L8.5 12l6 6" />
  </Svg>
)

/** Formas do semáforo, preenchidas, para uso grande. */
export function BandShape({ band, size = 28 }: { band: 'calmo' | 'atencao' | 'alto'; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" class={`shape shape-${band}`}>
      {band === 'calmo' && <circle cx="12" cy="12" r="10" fill="currentColor" />}
      {band === 'atencao' && <path d="M12 2.2l10.4 18.6H1.6z" fill="currentColor" stroke-linejoin="round" />}
      {band === 'alto' && <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" fill="currentColor" />}
    </svg>
  )
}

/**
 * Logo: uma linha de ruído que vai se aquietando até ficar reta,
 * dentro de um quadro como a lousa.
 */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" class="logo">
      <rect x="2" y="2" width="44" height="44" rx="9" fill="var(--accent)" />
      <path
        d="M9 24h3l2-10 3 20 3-14 2.5 8 2-5 2 3h14"
        fill="none"
        stroke="var(--accent-ink)"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  )
}

/** Enviar: seta saindo de uma bandeja. */
export const IconSend = (p: P) => (
  <Svg {...p}>
    <path d="M12 15V3.5M7.5 8L12 3.5 16.5 8M5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6" />
  </Svg>
)
