import { useEffect, useMemo, useState } from 'preact/hooks'
import { listSessions } from '../lib/db'
import { summarizeSession, trendLabel, turmaTrends, weeklyBuckets, type Bucket, type LessonSummary } from '../lib/evolution'
import { dec, dur } from '../ui/format'
import { LessonsTabs } from './Lessons'

const WEEKS = 8

const wk = (t: number) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

/** Barras por semana, rótulo direto em cada barra. */
function WeekBars({
  weeks,
  value,
  format,
  label,
  cls,
}: {
  weeks: Bucket[]
  value: (b: Bucket) => number | null
  format: (v: number) => string
  label: string
  cls: string
}) {
  const W = 420
  const H = 150
  const padB = 26
  const padT = 22
  const vals = weeks.map(value)
  const maxV = Math.max(1, ...vals.map((v) => (v === null || !Number.isFinite(v) ? 0 : v)))
  const bw = W / weeks.length
  return (
    <svg class={`weekbars ${cls}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line x1="0" x2={W} y1={H - padB} y2={H - padB} class="grid" />
      {weeks.map((b, i) => {
        const v = vals[i]
        const x = i * bw
        const has = v !== null && Number.isFinite(v) && b.aulas > 0
        const h = has ? Math.max(2, ((v as number) / maxV) * (H - padB - padT)) : 0
        const last = i === weeks.length - 1
        return (
          <g key={b.start}>
            {has ? (
              <>
                <rect x={x + bw * 0.18} y={H - padB - h} width={bw * 0.64} height={h} class={last ? 'bar bar-now' : 'bar'} />
                <text x={x + bw / 2} y={H - padB - h - 6} text-anchor="middle" class="val">
                  {format(v as number)}
                </text>
              </>
            ) : (
              <text x={x + bw / 2} y={H - padB - 6} text-anchor="middle" class="axis">
                –
              </text>
            )}
            <text x={x + bw / 2} y={H - 8} text-anchor="middle" class={last ? 'axis axis-now' : 'axis'}>
              {last ? 'esta' : wk(b.start)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function Spark({ serie }: { serie: number[] }) {
  if (serie.length < 2) return <span class="soft small">—</span>
  const w = 96
  const h = 26
  const m = Math.max(10, ...serie)
  const pts = serie.map((v, i) => `${((i / (serie.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - (v / m) * (h - 6)).toFixed(1)}`)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} class="tspark" aria-hidden="true">
      <polyline points={pts.join(' ')} />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="2.5" />
    </svg>
  )
}

function Delta({ now, before, unit, lowerIsBetter = true }: { now: number; before: number; unit: string; lowerIsBetter?: boolean }) {
  if (!Number.isFinite(now) || !Number.isFinite(before)) return null
  const d = now - before
  if (Math.abs(d) < 0.5) return <span class="delta soft">igual à semana passada</span>
  const better = lowerIsBetter ? d < 0 : d > 0
  return (
    <span class={`delta ${better ? 'text-calmo' : 'text-alto'}`}>
      {d > 0 ? '+' : '−'}
      {dec(Math.abs(d), 0)}
      {unit} que na semana passada
    </span>
  )
}

export function Evolution() {
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null)
  useEffect(() => {
    listSessions()
      .then((all) => setLessons(all.filter((s) => s.endedAt !== null).map((s) => summarizeSession(s))))
      .catch(() => setLessons([]))
  }, [])

  const weeks = useMemo(() => (lessons ? weeklyBuckets(lessons, WEEKS) : []), [lessons])
  const turmas = useMemo(() => (lessons ? turmaTrends(lessons) : []), [lessons])

  if (!lessons) return <p class="soft">Carregando…</p>

  const now = weeks[weeks.length - 1]
  const prev = weeks[weeks.length - 2]
  const vocalMin = (b?: Bucket) => (b ? b.vocalMs / 60000 : NaN)
  const anyUncal = lessons.some((l) => !l.calibrated)

  return (
    <div class="evolution">
      <LessonsTabs current="evolucao" />
      <h1>Evolução</h1>
      {lessons.length === 0 ? (
        <div class="empty">
          <p>Ainda não há aulas encerradas neste aparelho.</p>
          <p>
            A evolução aparece depois das primeiras aulas medidas. Comece pela tela <a href="#/medir">Medir</a>.
          </p>
        </div>
      ) : (
        <>
          <section class="week-now" aria-label="Esta semana">
            <p class="eyebrow">Esta semana</p>
            <dl class="figures">
              <div>
                <dt>Tempo de Risco Vocal</dt>
                <dd class="num">{dur(now.vocalMs)}</dd>
                <Delta now={vocalMin(now)} before={vocalMin(prev)} unit=" min" />
              </div>
              <div>
                <dt>Tempo na faixa alta</dt>
                <dd class="num">{now.aulas ? `${dec(now.pctAlto, 0)}%` : '—'}</dd>
                {now.aulas > 0 && prev.aulas > 0 && <Delta now={now.pctAlto} before={prev.pctAlto} unit=" pontos" />}
              </div>
              <div>
                <dt>Aulas medidas</dt>
                <dd class="num">{now.aulas}</dd>
                <span class="delta soft">{dur(now.measuredMs)} de medição</span>
              </div>
              <div>
                <dt>Média (Leq)</dt>
                <dd class="num">{now.leq !== null ? <>{dec(now.leq)} <small>dB(A)</small></> : '—'}</dd>
                {now.leq === null && now.aulas > 0 && <span class="delta soft">só com aparelho calibrado</span>}
              </div>
            </dl>
          </section>

          <section>
            <h2>Tempo de Risco Vocal por semana</h2>
            <p class="small soft">
              Soma do tempo em que o ruído de fundo passou do limiar de esforço vocal, nas aulas medidas. Semanas com mais aulas tendem a
              somar mais. Traço: semana sem aula medida.
            </p>
            <WeekBars
              weeks={weeks}
              value={(b) => b.vocalMs / 60000}
              format={(v) => (v > 0 && v < 1 ? '<1 min' : `${Math.round(v)} min`)}
              label={`Tempo de Risco Vocal nas últimas ${WEEKS} semanas`}
              cls="wb-vocal"
            />
          </section>

          <section>
            <h2>Tempo na faixa alta, por semana</h2>
            <p class="small soft">Porcentagem do tempo medido. Não depende de quantas aulas foram medidas.</p>
            <WeekBars
              weeks={weeks}
              value={(b) => b.pctAlto}
              format={(v) => `${Math.round(v)}%`}
              label={`Porcentagem do tempo na faixa alta nas últimas ${WEEKS} semanas`}
              cls="wb-alto"
            />
          </section>

          <section>
            <h2>Por turma</h2>
            <table class="ledger">
              <thead>
                <tr>
                  <th scope="col">Turma</th>
                  <th scope="col" class="r">
                    Aulas
                  </th>
                  <th scope="col" class="r">
                    Faixa alta
                  </th>
                  <th scope="col">Aula a aula</th>
                  <th scope="col">Tendência</th>
                </tr>
              </thead>
              <tbody>
                {turmas.map((t) => (
                  <tr key={t.turma}>
                    <th scope="row">{t.turma}</th>
                    <td class="r num">{t.aulas}</td>
                    <td class="r num">{dec(t.pctAlto, 0)}%</td>
                    <td>
                      <Spark serie={t.serie} />
                    </td>
                    <td class={t.tendencia !== null && t.tendencia <= -5 ? 'text-calmo' : t.tendencia !== null && t.tendencia >= 5 ? 'text-alto' : 'soft'}>
                      {trendLabel(t.tendencia)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p class="small soft">
              Tendência compara a metade mais recente das aulas de cada turma com a metade mais antiga. Só aparece a partir de 4 aulas e
              só diz “mais calma” ou “mais barulhenta” com diferença de 5 pontos ou mais.
            </p>
          </section>

          {anyUncal && (
            <p class="note small">
              Parte das aulas foi medida sem calibração. As porcentagens por faixa e as tendências continuam úteis para comparar a mesma
              turma no mesmo aparelho; as médias em dB(A) usam só as aulas calibradas.
            </p>
          )}
        </>
      )}
    </div>
  )
}
