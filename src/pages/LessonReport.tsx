import { useEffect, useMemo, useState } from 'preact/hooks'
import { deleteSession, getSession } from '../lib/db'
import { download, fileBase, toCSV, toExport } from '../lib/exporting'
import { computeReport, perSecond, type Session } from '../lib/session'
import { BandBar, HBar, Timeline } from '../ui/charts'
import { ACTIVITY_LABEL, loudestActivity, statsByActivity, type ActivityStats } from '../lib/activities'

function ActivitySection({ stats: all, calibrated }: { stats: ActivityStats[]; calibrated: boolean }) {
  // Um instante antes do primeiro toque não é informação: esconde.
  const stats = all.filter((s) => s.kind !== 'sem-marcacao' || s.measuredMs >= 5000)
  const loud = loudestActivity(stats)
  const quiet = stats.filter((s) => s.kind !== 'sem-marcacao' && s.measuredMs >= 120_000).sort((a, b) => a.pctAlto - b.pctAlto)[0]
  const maxPct = Math.max(1, ...stats.map((s) => s.pctAlto))
  return (
    <section>
      <h2>Por momento da aula</h2>
      {loud && (
        <p class="insight">
          {ACTIVITY_LABEL[loud.kind]} foi o momento mais barulhento: {Math.round(loud.pctAlto)}% do tempo na faixa alta
          {quiet && quiet.kind !== loud.kind ? `, contra ${Math.round(quiet.pctAlto)}% em ${ACTIVITY_LABEL[quiet.kind].toLowerCase()}` : ''}.
        </p>
      )}
      <table class="ledger activity-table">
        <thead>
          <tr>
            <th scope="col">Momento</th>
            <th scope="col" class="r">
              Tempo
            </th>
            <th scope="col">Faixa alta</th>
            {calibrated && (
              <th scope="col" class="r">
                Média
              </th>
            )}
            <th scope="col" class="r">
              Risco Vocal
            </th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.kind}>
              <th scope="row" class={s.kind === 'sem-marcacao' ? 'soft' : ''}>
                {ACTIVITY_LABEL[s.kind]}
              </th>
              <td class="r num">{dur(s.measuredMs)}</td>
              <td class="bar-cell">
                <HBar value={s.pctAlto} max={maxPct} band="alto" />
                <span class="num">{Math.round(s.pctAlto)}%</span>
              </td>
              {calibrated && <td class="r num">{dec(s.leq)} dB(A)</td>}
              <td class="r num">{dur(s.vocalMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="small soft">
        Trechos com menos de 2 minutos entram na tabela, mas não no destaque. “Sem marcação” é o tempo antes do primeiro toque.
      </p>
    </section>
  )
}
import { dateLong, dec, dur, hhmm } from '../ui/format'
import { IconDownload, IconPrint } from '../ui/icons'
import { go } from '../ui/router'
import { APP } from '../config'
import { ShareButtons } from '../ui/ShareButtons'
import { analyzeStreaks } from '../lib/vocalbreak'
import { appUrl, lessonSummaryText } from '../lib/share'

const GAP_LABEL = {
  pausa: 'pausa sua',
  interrompido: 'microfone interrompido',
  'segundo-plano': 'app em segundo plano',
  permissao: 'permissão do microfone',
} as const

export function LessonReport({ id }: { id: string }) {
  const [s, setS] = useState<Session | null | undefined>(undefined)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => {
    getSession(id).then((x) => setS(x ?? null), () => setS(null))
  }, [id])

  const r = useMemo(() => (s ? computeReport(s) : null), [s])
  const points = useMemo(() => (s ? perSecond(s) : []), [s])
  const acts = useMemo(() => (s?.marks?.length ? statsByActivity(s) : null), [s])
  const streaks = useMemo(() => (s ? analyzeStreaks(s, 0) : null), [s])

  if (s === undefined) return <p class="soft">Carregando…</p>
  if (s === null || !r)
    return (
      <div>
        <h1>Aula não encontrada</h1>
        <p>Ela pode ter sido apagada neste aparelho. <a href="#/aulas">Ver todas as aulas</a></p>
      </div>
    )

  const cal = r.calibrated
  const title = [s.turma, s.disciplina].filter(Boolean).join(' · ') || 'Aula sem nome'
  const empty = r.measuredMs < 5000

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    await deleteSession(s.id)
    go('aulas')
  }

  return (
    <article class="report">
      <header class="report-head">
        <p class="print-only small">{APP.name} · relatório da aula</p>
        <p class="eyebrow">{dateLong(s.startedAt)}</p>
        <h1>{title}</h1>
        <p class="soft">
          {hhmm(s.startedAt)}–{s.endedAt ? hhmm(s.endedAt) : 'em andamento'} · {dur(r.measuredMs)} medidos
          {r.gapMs > 0 && ` · ${dur(r.gapMs)} sem medição`} ·{' '}
          {cal ? (
            <span class="tag tag-cal">calibrado ±{r.margin} dB</span>
          ) : (
            <span class="tag tag-rel">relativo, sem calibração</span>
          )}
        </p>
      </header>

      {empty ? (
        <p class="note">Esta aula tem menos de 5 segundos de medição. Não há o que resumir.</p>
      ) : (
        <>
          <section class="report-figures" aria-label="Números da aula">
            {cal ? (
              <dl class="figures">
                <div>
                  <dt>Média (Leq)</dt>
                  <dd class="num">
                    {dec(r.leq)} <small>dB(A)</small>
                  </dd>
                </div>
                <div>
                  <dt>Picos frequentes (L10)</dt>
                  <dd class="num">
                    {dec(r.l10)} <small>dB(A)</small>
                  </dd>
                </div>
                <div>
                  <dt>Fundo (L90)</dt>
                  <dd class="num">
                    {dec(r.l90)} <small>dB(A)</small>
                  </dd>
                </div>
                <div>
                  <dt>Pico máximo</dt>
                  <dd class="num">
                    {dec(r.max)} <small>dB(A)</small>
                  </dd>
                </div>
              </dl>
            ) : (
              <dl class="figures">
                <div>
                  <dt>Diferença entre picos e fundo (L10 − L90)</dt>
                  <dd class="num">
                    {dec(r.l10 - r.l90)} <small>dB</small>
                  </dd>
                </div>
                <div class="figures-note">
                  <dd class="small soft">
                    Sem calibração, os números absolutos não são confiáveis. A diferença entre picos e fundo vale, porque
                    não depende do microfone. <a href="#/calibrar">Calibrar este aparelho</a>
                  </dd>
                </div>
              </dl>
            )}
          </section>

          <section>
            <h2>Linha do tempo</h2>
            <Timeline
              points={points}
              thresholds={s.thresholds}
              calibrated={cal}
              marks={s.marks}
              label={`Nível da sala de ${hhmm(s.startedAt)} até o fim da aula`}
            />
          </section>

          <section>
            <h2>Tempo em cada faixa</h2>
            <BandBar ms={r.bandMs} />
          </section>

          {acts && <ActivitySection stats={acts} calibrated={cal} />}

          <section class="vocal">
            <h2>Tempo de Risco Vocal</h2>
            <p class="vocal-value num">{dur(r.vocalMs)}</p>
            <p>
              Tempo em que o ruído de fundo da sala ficou acima {cal ? `de ${s.thresholds.esforcoVocal} dB(A)` : 'do limiar de esforço vocal'}, nível
              a partir do qual a voz tende a subir para ser ouvida. O cálculo usa o fundo (L90 de cada 10 s), para não contar a sua
              própria fala.
            </p>
            {streaks && (streaks.longestMs >= 60_000 || !!s.lembretes?.length) && (
              <p>
                {streaks.longestMs >= 60_000 && (
                  <>
                    Maior sequência seguida: <strong class="num">{dur(streaks.longestMs)}</strong>.
                  </>
                )}
                {s.lembretes?.length
                  ? ` O app sugeriu pausa de voz ${s.lembretes.length === 1 ? 'uma vez' : `${s.lembretes.length} vezes`} (${s.lembretes.map(hhmm).join(', ')}).`
                  : ''}
              </p>
            )}
            <p class="small soft">
              É um indicador de exposição. Não mede a sua voz e não é diagnóstico.
              {!cal && ' Sem calibração, este tempo é só uma estimativa grosseira.'}
            </p>
            {r.vocalMs > 10 * 60_000 && (
              <div class="selfcare">
                <h3>Para os próximos dias</h3>
                <ul>
                  <li>Água por perto e goles pequenos ao longo da aula.</li>
                  <li>Combine um sinal com a turma (mão levantada, palmas) em vez de falar mais alto.</li>
                  <li>Faça pausas de voz: atividades em que a turma fala e você ouve.</li>
                  <li>Se a rouquidão durar mais de duas semanas, procure fonoaudiologia.</li>
                </ul>
              </div>
            )}
          </section>

          {s.gaps.length > 0 && (
            <section>
              <h2>Períodos sem medição</h2>
              <ul class="gaps num">
                {s.gaps.map((g) => (
                  <li key={g.start}>
                    {hhmm(g.start)}–{hhmm(g.end)} · {dur(g.end - g.start)} · {GAP_LABEL[g.reason]}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section class="exports no-print">
        <h2>Levar para fora do aparelho</h2>
        <ShareButtons
          title={`${APP.name} · ${title}`}
          text={lessonSummaryText(s, r, appUrl())}
          file={() => ({ name: `${fileBase(s)}.json`, json: JSON.stringify(toExport(s, r)) })}
        />
        <p class="small soft">
          Abre o menu de compartilhar do aparelho (WhatsApp, e-mail…) com o arquivo para a tela <a href="#/escola">Escola</a> e um resumo
          da aula. Para mandar em PDF: “Imprimir ou salvar PDF”, escolha “Salvar como PDF” e compartilhe o arquivo salvo.
        </p>
        <h3 class="exports-sub">Baixar</h3>
        <div class="row">
          <button class="btn" onClick={() => window.print()}>
            <IconPrint /> Imprimir ou salvar PDF
          </button>
          <button class="btn" onClick={() => download(`${fileBase(s)}.csv`, toCSV(s), 'text/csv;charset=utf-8')}>
            <IconDownload /> Planilha (CSV)
          </button>
          <button
            class="btn"
            onClick={() => download(`${fileBase(s)}.json`, JSON.stringify(toExport(s, r)), 'application/json')}
          >
            <IconDownload /> Arquivo para a escola (JSON)
          </button>
        </div>
        <p class="small soft">
          O arquivo para a escola leva só os números por segundo, a turma, a disciplina e os momentos marcados. Nada de áudio.
        </p>
        <button class="btn btn-danger" onClick={remove}>
          {confirmDelete ? 'Toque de novo para apagar de vez' : 'Apagar esta aula'}
        </button>
      </section>

      <footer class="print-only small">
        <p>
          Indicador de exposição ao ruído, medido com microfone de {cal ? 'aparelho calibrado' : 'aparelho sem calibração (valores relativos)'}.
          Não substitui avaliação de fonoaudiologia ou de medicina do trabalho. Gerado por {APP.name} em{' '}
          {new Date().toLocaleString('pt-BR')}.
        </p>
      </footer>
    </article>
  )
}
