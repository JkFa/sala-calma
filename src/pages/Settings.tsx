import { useState } from 'preact/hooks'
import { DEFAULT_THRESHOLDS, SOURCES } from '../config'
import { settings, type Theme } from '../state/settings'
import { useStore } from '../state/store'
import { lesson } from '../state/lesson'
import { InstallHelp } from './Home'

export function SettingsPage() {
  const s = useStore(settings)
  const l = useStore(lesson)
  const t = s.thresholds
  const [wipe, setWipe] = useState(false)

  const setT = (k: keyof typeof t, v: string) => {
    const n = Number(v.replace(',', '.'))
    if (Number.isFinite(n)) settings.set({ thresholds: { ...t, [k]: n } })
  }
  const invalid = t.calmoAte >= t.altoDesde

  const wipeAll = async () => {
    if (!wipe) {
      setWipe(true)
      return
    }
    localStorage.clear()
    indexedDB.deleteDatabase('sala-calma')
    location.reload()
  }

  return (
    <div class="settings">
      <h1>Ajustes</h1>

      <section>
        <h2>Faixas</h2>
        <p class="small soft">
          Valores em dB(A) de aparelho calibrado. Sem calibração, as faixas usam um ajuste genérico e servem só como referência relativa.
          Mudanças valem para as próximas aulas.
        </p>
        {l.session && <p class="note small">A aula em andamento continua com as faixas de quando começou.</p>}
        <div class="grid-2">
          <div class="field">
            <label for="calmo">
              Calmo até <span class="hint">dB(A)</span>
            </label>
            <input id="calmo" type="number" inputMode="decimal" value={t.calmoAte} onChange={(e) => setT('calmoAte', e.currentTarget.value)} />
          </div>
          <div class="field">
            <label for="alto">
              Alto a partir de <span class="hint">dB(A)</span>
            </label>
            <input id="alto" type="number" inputMode="decimal" value={t.altoDesde} onChange={(e) => setT('altoDesde', e.currentTarget.value)} />
          </div>
          <div class="field">
            <label for="vocal">
              Limiar de esforço vocal <span class="hint">ruído de fundo, dB(A)</span>
            </label>
            <input id="vocal" type="number" inputMode="decimal" value={t.esforcoVocal} onChange={(e) => setT('esforcoVocal', e.currentTarget.value)} />
          </div>
          <div class="field">
            <label for="meta">
              Meta do semáforo <span class="hint">minutos na faixa calma</span>
            </label>
            <input
              id="meta"
              type="number"
              inputMode="numeric"
              min="0"
              value={s.metaMinutos}
              onChange={(e) => settings.set({ metaMinutos: Math.max(0, Math.round(Number(e.currentTarget.value) || 0)) })}
            />
          </div>
        </div>
        {invalid && (
          <p class="note note-error" role="alert">
            “Calmo até” precisa ser menor que “Alto a partir de”.
          </p>
        )}
        <button class="btn btn-quiet" onClick={() => settings.set({ thresholds: { ...DEFAULT_THRESHOLDS } })}>
          Voltar aos valores padrão
        </button>
      </section>

      <section>
        <h2>Aparência e som</h2>
        <div class="field">
          <label for="tema">Tema</label>
          <select id="tema" value={s.theme} onChange={(e) => settings.set({ theme: e.currentTarget.value as Theme })}>
            <option value="auto">Igual ao aparelho</option>
            <option value="claro">Claro</option>
            <option value="escuro">Escuro</option>
          </select>
        </div>
        <label class="check">
          <input type="checkbox" checked={s.mudo} onChange={(e) => settings.set({ mudo: e.currentTarget.checked })} />
          Silenciar todos os sons do app
        </label>
        <p class="small soft">O único som é um toque suave quando a turma cumpre a meta do semáforo.</p>
      </section>

      <section>
        <h2>Calibração</h2>
        <p>
          {s.calibration ? `Aparelho calibrado (±${s.calibration.margin} dB).` : 'Aparelho sem calibração.'}{' '}
          <a href="#/calibrar">{s.calibration ? 'Recalibrar' : 'Calibrar agora'}</a>
        </p>
      </section>

      <section>
        <h2>Instalar no aparelho</h2>
        <InstallHelp />
      </section>

      <section id="fontes">
        <h2>De onde vêm os limiares</h2>
        <ul class="sources">
          {SOURCES.map((src) => (
            <li key={src.id}>
              <a href={src.url} target="_blank" rel="noopener noreferrer">
                {src.label}
              </a>
              {src.status === 'a confirmar' && <span class="tag tag-rel">a confirmar</span>}
              <br />
              <span class="small soft">{src.detail}</span>
            </li>
          ))}
        </ul>
        <p class="small soft">
          As faixas calmo/atenção/alto (55 e 65 dB(A) por padrão) não vêm de norma: são pontos de partida para sala ocupada, que
          você pode ajustar.
        </p>
      </section>

      <section>
        <h2>Backup e troca de aparelho</h2>
        <p>
          {s.ultimoBackup
            ? `Último backup: ${new Date(s.ultimoBackup).toLocaleDateString('pt-BR')}.`
            : 'Nenhum backup feito ainda. As aulas ficam só neste aparelho.'}{' '}
          <a href="#/backup">Fazer backup ou restaurar</a>
        </p>
      </section>

      <section>
        <h2>Dados deste aparelho</h2>
        <p class="small">
          Apaga aulas, salas vazias, calibração e ajustes. Não dá para desfazer: faça um <a href="#/backup">backup</a> antes.
        </p>
        <button class="btn btn-danger" onClick={wipeAll} disabled={!!l.session}>
          {wipe ? 'Toque de novo para apagar tudo' : 'Apagar todos os dados'}
        </button>
      </section>
    </div>
  )
}
