/**
 * Gráficos desenhados à mão em SVG. Eixos discretos, rótulos diretos.
 */
import type { Band, Thresholds } from '../lib/session'
import { BAND_LABEL, dur, hhmm } from './format'
import { ACTIVITY_LABEL, activitySpans, type Mark } from '../lib/activities'

export interface Point {
  t: number
  v: number | null
}

interface TimelineProps {
  points: Point[]
  thresholds: Thresholds
  calibrated: boolean
  height?: number
  /** Rótulo acessível. */
  label: string
  /** Momentos da aula, para a faixa sob o gráfico. */
  marks?: Mark[]
}

const W = 720

/** Agrupa em colunas: Leq e máximo de cada coluna; null se só lacuna. */
function bin(points: Point[], t0: number, t1: number, cols: number) {
  const out: { leq: number | null; max: number | null }[] = Array.from({ length: cols }, () => ({ leq: null, max: null }))
  const acc = Array.from({ length: cols }, () => ({ e: 0, n: 0, m: -Infinity }))
  const span = Math.max(1, t1 - t0)
  for (const p of points) {
    if (p.v === null) continue
    const i = Math.min(cols - 1, Math.max(0, Math.floor(((p.t - t0) / span) * cols)))
    acc[i].e += Math.pow(10, p.v / 10)
    acc[i].n++
    acc[i].m = Math.max(acc[i].m, p.v)
  }
  acc.forEach((a, i) => {
    if (a.n) out[i] = { leq: 10 * Math.log10(a.e / a.n), max: a.m }
  })
  return out
}

export function Timeline({ points, thresholds, calibrated, height = 220, label, marks }: TimelineProps) {
  const valid = points.filter((p) => p.v !== null) as { t: number; v: number }[]
  if (valid.length < 2) {
    return <p class="soft">Ainda não há medição suficiente para o gráfico.</p>
  }
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const padL = calibrated ? 44 : 8
  const padR = 110
  const padT = calibrated ? 24 : 14
  const padB = 28
  const iw = W - padL - padR
  const ih = height - padT - padB

  const vals = valid.map((p) => p.v)
  let lo = Math.min(...vals, thresholds.calmoAte - 10)
  let hi = Math.max(...vals, thresholds.altoDesde + 6)
  lo = Math.floor(lo / 5) * 5
  hi = Math.ceil(hi / 5) * 5
  const y = (v: number) => padT + ih - ((v - lo) / (hi - lo)) * ih
  const cols = Math.min(240, Math.max(30, valid.length))
  const bins = bin(points, t0, t1, cols)
  const x = (i: number) => padL + ((i + 0.5) / cols) * iw
  const xt = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * iw

  // Caminho do Leq, quebrado nas lacunas.
  let d = ''
  let pen = false
  bins.forEach((b, i) => {
    if (b.leq === null) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(b.leq).toFixed(1)}`
    pen = true
  })
  // Faixa de picos (máximo de cada coluna), discreta.
  const peaks = bins
    .map((b, i) => (b.max === null || b.leq === null ? '' : `M${x(i).toFixed(1)},${y(b.max).toFixed(1)}V${y(b.leq).toFixed(1)}`))
    .join('')

  // Lacunas: trechos com null na série original.
  const gaps: { a: number; b: number }[] = []
  points.forEach((p, i) => {
    if (p.v === null && points[i + 1]) gaps.push({ a: p.t, b: points[i + 1].t })
  })

  const ticks: number[] = []
  const totalMin = (t1 - t0) / 60000
  const stepMin = totalMin > 120 ? 30 : totalMin > 50 ? 15 : totalMin > 20 ? 10 : totalMin > 6 ? 2 : 1
  const first = Math.ceil(t0 / (stepMin * 60000)) * stepMin * 60000
  for (let t = first; t <= t1; t += stepMin * 60000) ticks.push(t)

  const spans = marks && marks.length ? activitySpans(marks, t0, t1) : null
  const stripY = height + 2
  const stripH = 22
  const totalH = spans ? height + stripH + 8 : height

  const yTicks: number[] = []
  if (calibrated) for (let v = lo; v <= hi; v += hi - lo > 30 ? 10 : 5) yTicks.push(v)

  return (
    <figure class="chart">
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        role="img"
        aria-label={
          spans
            ? `${label}. Momentos: ${spans.filter((s) => s.kind !== 'sem-marcacao').map((s) => `${ACTIVITY_LABEL[s.kind]} de ${hhmm(s.a)} a ${hhmm(s.b)}`).join('; ')}`
            : label
        }
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--gap)" stroke-width="1.2" />
          </pattern>
          <pattern id="dots" width="5" height="5" patternUnits="userSpaceOnUse">
            <circle cx="2.5" cy="2.5" r="0.8" fill="var(--rule-strong)" />
          </pattern>
        </defs>
        {/* Fundo das faixas, bem leve */}
        <rect x={padL} y={padT} width={iw} height={Math.max(0, y(thresholds.altoDesde) - padT)} class="zone zone-alto" />
        <rect
          x={padL}
          y={y(thresholds.altoDesde)}
          width={iw}
          height={Math.max(0, y(thresholds.calmoAte) - y(thresholds.altoDesde))}
          class="zone zone-atencao"
        />
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={padL + iw} y1={y(v)} y2={y(v)} class="grid" />
            <text x={padL - 6} y={y(v) + 4} class="axis" text-anchor="end">
              {v}
            </text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={t} x={xt(t)} y={height - 8} class="axis" text-anchor="middle">
            {hhmm(t)}
          </text>
        ))}
        {gaps.map((g) => (
          <g key={g.a}>
            <rect x={xt(g.a)} y={padT} width={Math.max(2, xt(g.b) - xt(g.a))} height={ih} fill="url(#hatch)" opacity="0.6" />
            {xt(g.b) - xt(g.a) > 60 && (
              <text x={(xt(g.a) + xt(g.b)) / 2} y={padT + 14} class="axis gap-label" text-anchor="middle">
                sem medição
              </text>
            )}
          </g>
        ))}
        <path d={peaks} class="peaks" />
        <path d={d} class="line" />
        {/* Limiares com rótulo direto */}
        <line x1={padL} x2={padL + iw} y1={y(thresholds.altoDesde)} y2={y(thresholds.altoDesde)} class="th th-alto" />
        <line x1={padL} x2={padL + iw} y1={y(thresholds.calmoAte)} y2={y(thresholds.calmoAte)} class="th th-calmo" />
        <text x={padL + iw + 8} y={y(thresholds.altoDesde) - 4} class="th-label th-label-alto">
          {calibrated ? `${thresholds.altoDesde} · alto` : 'alto'}
        </text>
        <text x={padL + iw + 8} y={y(thresholds.calmoAte) + 14} class="th-label th-label-calmo">
          {calibrated ? `${thresholds.calmoAte} · calmo` : 'calmo'}
        </text>
        <text x={padL + iw + 8} y={(y(thresholds.altoDesde) + y(thresholds.calmoAte)) / 2 + 4} class="th-label th-label-atencao">
          atenção
        </text>
        {calibrated && (
          <text x={padL - 6} y={padT - 12} class="axis" text-anchor="end">
            dB(A)
          </text>
        )}
        {spans && (
          <g class="act-strip">
            {spans.map((s, i) => {
              const xa = xt(s.a)
              const w = Math.max(1, xt(s.b) - xa)
              const marked = spans.slice(0, i).filter((p) => p.kind !== 'sem-marcacao').length
              return (
                <g key={s.a}>
                  <rect
                    x={xa}
                    y={stripY}
                    width={w}
                    height={stripH}
                    class={`act ${s.kind === 'sem-marcacao' ? 'act-none' : `act-${marked % 2}`}`}
                  />
                  {s.kind !== 'sem-marcacao' && w > 120 && (
                    <text x={xa + 6} y={stripY + 15} class="act-label">
                      {ACTIVITY_LABEL[s.kind]}
                    </text>
                  )}
                </g>
              )
            })}
            <text x={padL + iw + 8} y={stripY + 15} class="axis">
              momentos
            </text>
          </g>
        )}
      </svg>
      <figcaption class="small soft">
        Linha: nível médio. Traços finos: picos. {calibrated ? '' : 'Escala relativa: aparelho sem calibração. '}
        {gaps.length > 0 && 'Hachurado: período sem medição.'}
      </figcaption>
    </figure>
  )
}

/** Gráfico ao vivo, últimos minutos. */
export function Spark({ values, thresholds }: { values: number[]; thresholds: Thresholds }) {
  const w = 320
  const h = 64
  if (values.length < 2) return <div class="spark spark-empty" aria-hidden="true" />
  const lo = Math.min(...values, thresholds.calmoAte - 8)
  const hi = Math.max(...values, thresholds.altoDesde + 4)
  const y = (v: number) => h - 4 - ((v - lo) / (hi - lo)) * (h - 8)
  const x = (i: number) => w - (values.length - 1 - i) * (w / 119)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return (
    <svg class="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2={w} y1={y(thresholds.altoDesde)} y2={y(thresholds.altoDesde)} class="th th-alto" />
      <line x1="0" x2={w} y1={y(thresholds.calmoAte)} y2={y(thresholds.calmoAte)} class="th th-calmo" />
      <path d={d} class="line" vector-effect="non-scaling-stroke" />
    </svg>
  )
}

/** Barra empilhada com o tempo em cada faixa, rótulos diretos. */
export function BandBar({ ms }: { ms: Record<Band, number> }) {
  const total = ms.calmo + ms.atencao + ms.alto
  if (!total) return null
  const order: Band[] = ['calmo', 'atencao', 'alto']
  return (
    <div class="bandbar">
      <div class="bandbar-track" role="img" aria-label={order.map((b) => `${BAND_LABEL[b]}: ${dur(ms[b])}`).join(', ')}>
        {order.map((b) =>
          ms[b] > 0 ? <span key={b} class={`bandbar-seg bg-${b}`} style={{ flexGrow: ms[b] }} /> : null,
        )}
      </div>
      <dl class="bandbar-legend">
        {order.map((b) => (
          <div key={b} class={`bandbar-item text-${b}`}>
            <dt>{BAND_LABEL[b]}</dt>
            <dd class="num">
              {dur(ms[b])} <span class="soft">· {Math.round((ms[b] / total) * 100)}%</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Barra horizontal simples (painel da escola). */
export function HBar({ value, max, band }: { value: number; max: number; band: Band }) {
  return (
    <span class="hbar" aria-hidden="true">
      <span class={`hbar-fill bg-${band}`} style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
    </span>
  )
}
