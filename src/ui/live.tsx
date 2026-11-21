/**
 * Visualizações ao vivo da tela Medir: gráfico com escala automática e
 * medidores de ponteiro. SVG desenhado à mão, como o resto dos gráficos.
 */
import type { Band, Thresholds } from '../lib/session'
import { bandOf } from '../lib/session'
import { BAND_LABEL, dec } from './format'

/** Menor faixa vertical do gráfico, em dB: evita ampliar ruído de 0,5 dB. */
const MIN_RANGE = 12

function spanLabel(ms: number) {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`
}

interface LiveChartProps {
  values: number[]
  /** Intervalo entre pontos, em ms. */
  stepMs: number
  thresholds: Thresholds
  calibrated: boolean
}

/**
 * Gráfico ao vivo. Ocupa a largura toda desde o primeiro segundo e ajusta
 * a escala aos valores medidos, para a oscilação aparecer mesmo quando o
 * microfone capta pouco (comum em notebooks e computadores de mesa).
 */
export function LiveChart({ values, stepMs, thresholds, calibrated }: LiveChartProps) {
  const W = 640
  const H = 220
  const padL = calibrated ? 34 : 10
  const padR = 64
  const padT = 10
  const padB = 24
  const iw = W - padL - padR
  const ih = H - padT - padB

  if (values.length < 2) {
    return (
      <div class="livechart livechart-empty" aria-hidden="true">
        <span>Ouvindo…</span>
      </div>
    )
  }

  let vmin = Infinity
  let vmax = -Infinity
  for (const v of values) {
    if (v < vmin) vmin = v
    if (v > vmax) vmax = v
  }
  let lo = Math.floor(vmin - 2)
  let hi = Math.ceil(vmax + 2)
  if (hi - lo < MIN_RANGE) {
    const mid = (hi + lo) / 2
    lo = Math.floor(mid - MIN_RANGE / 2)
    hi = lo + MIN_RANGE
  }
  const step = hi - lo > 40 ? 10 : hi - lo > 18 ? 5 : 2
  lo = Math.floor(lo / step) * step
  hi = Math.ceil(hi / step) * step

  const n = values.length
  const y = (v: number) => padT + ih - ((v - lo) / (hi - lo)) * ih
  const x = (i: number) => padL + (i / (n - 1)) * iw
  const clampY = (v: number) => Math.min(padT + ih, Math.max(padT, y(v)))

  let d = ''
  for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(values[i]).toFixed(1)}`
  const area = `${d}L${x(n - 1).toFixed(1)},${padT + ih}L${padL},${padT + ih}Z`

  const yTicks: number[] = []
  for (let v = lo; v <= hi; v += step) yTicks.push(v)

  const last = values[n - 1]
  const band = bandOf(last, thresholds)
  const spanMs = (n - 1) * stepMs
  const inRange = (v: number) => v > lo && v < hi

  const yAlto = clampY(thresholds.altoDesde)
  const yCalmo = clampY(thresholds.calmoAte)

  return (
    <figure class="chart livechart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Gráfico do nível nos últimos ${spanLabel(spanMs)}. Agora: ${BAND_LABEL[band]}.`}
      >
        {/* Faixas ao fundo */}
        <rect x={padL} y={padT} width={iw} height={Math.max(0, yAlto - padT)} class="zone zone-alto" />
        <rect x={padL} y={yAlto} width={iw} height={Math.max(0, yCalmo - yAlto)} class="zone zone-atencao" />
        <rect x={padL} y={yCalmo} width={iw} height={Math.max(0, padT + ih - yCalmo)} class="zone zone-calmo" />
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={padL + iw} y1={y(v)} y2={y(v)} class="grid" />
            {calibrated && (
              <text x={padL - 6} y={y(v) + 4} class="axis" text-anchor="end">
                {v}
              </text>
            )}
          </g>
        ))}
        {inRange(thresholds.altoDesde) && (
          <>
            <line x1={padL} x2={padL + iw} y1={yAlto} y2={yAlto} class="th th-alto" />
            <text x={padL + iw + 6} y={yAlto + 4} class="th-label th-label-alto">
              alto
            </text>
          </>
        )}
        {inRange(thresholds.calmoAte) && (
          <>
            <line x1={padL} x2={padL + iw} y1={yCalmo} y2={yCalmo} class="th th-calmo" />
            <text x={padL + iw + 6} y={yCalmo + 4} class="th-label th-label-calmo">
              calmo
            </text>
          </>
        )}
        <path d={area} class="livechart-area" />
        <path d={d} class="livechart-line" />
        <circle cx={x(n - 1)} cy={y(last)} r="5" class={`livechart-dot fill-${band}`} />
        <text x={padL} y={H - 6} class="axis">
          −{spanLabel(spanMs)}
        </text>
        <text x={padL + iw} y={H - 6} class="axis" text-anchor="end">
          agora
        </text>
      </svg>
      <figcaption class="small soft">
        {calibrated ? 'dB(A). ' : `Escala relativa: cada linha = ${step} dB. `}A escala se ajusta ao que foi medido.
      </figcaption>
    </figure>
  )
}

interface GaugeProps {
  label: string
  value: number | null
  /** Marca de pico (máximo recente), opcional. */
  peak?: number | null
  lo: number
  hi: number
  thresholds: Thresholds
  calibrated: boolean
}

const SWEEP = 240
const CX = 100
const CY = 100
const R = 78

function angleOf(v: number, lo: number, hi: number) {
  const f = Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
  // 0 → 210° (esquerda, embaixo); 1 → −30° (direita, embaixo)
  return 210 - f * SWEEP
}

function pt(angleDeg: number, r: number) {
  const a = (angleDeg * Math.PI) / 180
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) }
}

function arc(a0: number, a1: number, r: number) {
  // a0 > a1 (sentido horário na tela)
  const p0 = pt(a0, r)
  const p1 = pt(a1, r)
  const large = a0 - a1 > 180 ? 1 : 0
  return `M${p0.x.toFixed(2)},${p0.y.toFixed(2)}A${r},${r} 0 ${large} 1 ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`
}

/** Medidor de ponteiro com as três faixas no mostrador. */
export function Gauge({ label, value, peak, lo, hi, thresholds, calibrated }: GaugeProps) {
  const a = (v: number) => angleOf(v, lo, hi)
  const zones: { b: Band; from: number; to: number }[] = [
    { b: 'calmo', from: lo, to: Math.min(hi, thresholds.calmoAte) },
    { b: 'atencao', from: Math.max(lo, thresholds.calmoAte), to: Math.min(hi, thresholds.altoDesde) },
    { b: 'alto', from: Math.max(lo, thresholds.altoDesde), to: hi },
  ]
  const major = hi - lo > 40 ? 10 : 5
  const ticks: { v: number; major: boolean }[] = []
  for (let v = Math.ceil(lo / (major / 5)) * (major / 5); v <= hi; v += major / 5) {
    ticks.push({ v, major: v % major === 0 })
  }
  const band = value === null ? null : bandOf(value, thresholds)
  const rot = value === null ? -SWEEP / 2 : 90 - a(value)

  return (
    <figure class="gauge">
      <svg
        viewBox="0 0 200 150"
        role="img"
        aria-label={
          value === null
            ? `${label}: sem leitura`
            : `${label}: ${calibrated ? `${dec(value, 0)} dB(A), ` : ''}${BAND_LABEL[band!]}`
        }
      >
        {zones.map((z) =>
          z.to > z.from ? <path key={z.b} d={arc(a(z.from), a(z.to), R)} class={`gauge-zone stroke-${z.b}`} /> : null,
        )}
        {ticks.map((t) => {
          const p0 = pt(a(t.v), R - 12)
          const p1 = pt(a(t.v), t.major ? R - 22 : R - 17)
          return (
            <g key={t.v}>
              <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} class={t.major ? 'gauge-tick gauge-tick-major' : 'gauge-tick'} />
              {t.major && calibrated && (
                <text x={pt(a(t.v), R - 32).x} y={pt(a(t.v), R - 32).y + 3.5} class="gauge-num" text-anchor="middle">
                  {t.v}
                </text>
              )}
            </g>
          )
        })}
        {peak != null && (
          <path
            d={(() => {
              const ang = a(peak)
              const tip = pt(ang, R - 9)
              const l = pt(ang + 4, R + 5)
              const r = pt(ang - 4, R + 5)
              return `M${tip.x.toFixed(2)},${tip.y.toFixed(2)}L${l.x.toFixed(2)},${l.y.toFixed(2)}L${r.x.toFixed(2)},${r.y.toFixed(2)}Z`
            })()}
            class="gauge-peak"
          >
            <title>Pico dos últimos 10 s</title>
          </path>
        )}
        <g class="gauge-needle" style={{ transform: `rotate(${rot.toFixed(2)}deg)` }}>
          <path d={`M${CX - 3},${CY}L${CX},${CY - R + 8}L${CX + 3},${CY}Z`} />
        </g>
        <circle cx={CX} cy={CY} r="7" class="gauge-hub" />
        <text x={CX} y={CY + 34} class={`gauge-value ${band ? 'text-' + band : ''}`} text-anchor="middle">
          {value === null ? '–' : calibrated ? dec(value, 0) : BAND_LABEL[band!]}
        </text>
        {calibrated && (
          <text x={CX} y={CY + 47} class="gauge-unit" text-anchor="middle">
            dB(A)
          </text>
        )}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  )
}

/** Escala comum aos medidores: cobre as faixas e o que já foi medido. */
export function gaugeRange(thresholds: Thresholds, seen: number[]) {
  let lo = thresholds.calmoAte - 25
  let hi = thresholds.altoDesde + 15
  for (const v of seen) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return { lo: Math.floor(lo / 5) * 5, hi: Math.ceil(hi / 5) * 5 }
}
