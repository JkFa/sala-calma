/**
 * Backup e troca de aparelho. Restaurar junta com o que já existe; nunca
 * apaga. A calibração do outro aparelho só entra se o professor pedir.
 */
import { useEffect, useState } from 'preact/hooks'
import { APP } from '../config'
import { applySettings, backupName, isBackup, makeBackup, planRestore, type RestorePlan } from '../lib/backup'
import { listRooms, listSessions, saveRoom, saveSession } from '../lib/db'
import type { RoomMeasurement } from '../lib/room'
import type { Session } from '../lib/session'
import { appUrl, browserEnv, SHARE_MESSAGE, shareFile } from '../lib/share'
import { lesson } from '../state/lesson'
import { isIOS, pwa } from '../state/pwa'
import { settings } from '../state/settings'
import { useStore } from '../state/store'
import { dateLong, dateShort, dec } from '../ui/format'
import { IconBack, IconDownload, IconSend } from '../ui/icons'

function deviceLabel() {
  const m = navigator.userAgent.match(/\(([^)]+)\)/)
  return m ? m[1].split(';').slice(0, 3).join(';').trim() : ''
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`
}

function StorageStatus() {
  const [info, setInfo] = useState<{ persisted: boolean | null; usage: number | null }>({ persisted: null, usage: null })
  useEffect(() => {
    const st = navigator.storage
    if (!st) return
    Promise.all([st.persisted?.() ?? Promise.resolve(null), st.estimate?.() ?? Promise.resolve(null)])
      .then(([persisted, est]) => setInfo({ persisted, usage: est?.usage ?? null }))
      .catch(() => {})
  }, [])
  const p = useStore(pwa)
  return (
    <ul class="small storage">
      {info.usage !== null && <li>Espaço usado pelo app neste aparelho: {dec(info.usage / 1024 / 1024, 1)} MB.</li>}
      {info.persisted === true && <li>O navegador marcou os dados do app como permanentes: não apaga sozinho para liberar espaço.</li>}
      {info.persisted === false && (
        <li>
          O navegador ainda não marcou os dados como permanentes. Em aparelho com pouco espaço, ele pode apagar dados de sites pouco
          usados. {p.installed ? '' : 'Instalar o app na tela de início ajuda.'}
        </li>
      )}
      {isIOS && !p.installed && (
        <li>
          <strong>iPhone:</strong> o Safari pode apagar os dados de sites não instalados depois de 7 dias sem uso. Instale o app na
          tela de início (Ajustes › Instalar no aparelho) e faça backup de vez em quando.
        </li>
      )}
    </ul>
  )
}

export function BackupPage() {
  const st = useStore(settings)
  const l = useStore(lesson)
  const [data, setData] = useState<{ sessions: Session[]; rooms: RoomMeasurement[] } | null>(null)
  const [msg, setMsg] = useState('')
  const [plan, setPlan] = useState<RestorePlan | null>(null)
  const [fileErr, setFileErr] = useState('')
  const [optAjustes, setOptAjustes] = useState(true)
  const [optCal, setOptCal] = useState(false)
  const [done, setDone] = useState('')

  const load = () =>
    Promise.all([listSessions(), listRooms()]).then(
      ([sessions, rooms]) => setData({ sessions, rooms }),
      () => setData({ sessions: [], rooms: [] }),
    )
  useEffect(() => {
    void load()
  }, [])

  if (!data) return <p class="soft">Carregando…</p>

  const nA = data.sessions.length
  const nS = data.rooms.length
  const what = [plural(nA, 'aula', 'aulas'), nS ? plural(nS, 'sala vazia', 'salas vazias') : ''].filter(Boolean).join(' e ')

  const json = () => JSON.stringify(makeBackup(data.sessions, data.rooms, settings.get(), deviceLabel()))
  const mark = () => settings.set({ ultimoBackup: new Date().toISOString() })

  const download = () => {
    browserEnv().download(backupName(), json(), 'application/json')
    mark()
    setMsg('Backup baixado. Guarde o arquivo fora do celular (e-mail, Drive, computador).')
  }
  const send = () => {
    const text = `Backup do ${APP.name}: ${what}. Para restaurar em outro aparelho: abra ${appUrl()}, vá em Ajustes › Backup › Restaurar e escolha este arquivo.`
    void shareFile({ name: backupName(), json: json(), text, title: `Backup do ${APP.name}` }).then((r) => {
      if (r !== 'cancelado') mark()
      setMsg(r === 'compartilhado' || r === 'compartilhado-txt' ? 'Backup enviado.' : SHARE_MESSAGE[r])
    })
  }

  const onFile = async (f: File | undefined) => {
    setFileErr('')
    setPlan(null)
    setDone('')
    if (!f) return
    let parsed: unknown
    try {
      parsed = JSON.parse(await f.text())
    } catch {
      setFileErr('Não consegui ler este arquivo. Escolha o arquivo de backup (sala-calma_backup_….json ou .txt).')
      return
    }
    if (!isBackup(parsed)) {
      setFileErr(
        `Este arquivo não é um backup do ${APP.name}. Arquivos de aula ou de sala vazia (enviados para a coordenação) abrem na tela Escola.`,
      )
      return
    }
    const [sessions, rooms] = await Promise.all([listSessions(), listRooms()])
    setOptAjustes(true)
    setOptCal(false)
    setPlan(planRestore(parsed, new Set(sessions.map((s) => s.id)), new Set(rooms.map((r) => r.id))))
  }

  const restore = async () => {
    if (!plan) return
    for (const s of plan.novasAulas) await saveSession(s)
    for (const r of plan.novasSalas) await saveRoom(r)
    settings.set(applySettings(settings.get(), plan, { ajustes: optAjustes, calibracao: optCal }))
    setDone(
      `Pronto: ${plural(plan.novasAulas.length, 'aula restaurada', 'aulas restauradas')} e ${plural(plan.novasSalas.length, 'sala vazia', 'salas vazias')}.` +
        (optAjustes && plan.ajustes ? ' Ajustes aplicados.' : '') +
        (optCal && plan.calibracao ? ' Calibração do outro aparelho aplicada.' : ''),
    )
    setPlan(null)
    void load()
  }

  return (
    <div class="backup">
      <a href="#/ajustes" class="btn btn-quiet back-link">
        <IconBack /> Ajustes
      </a>
      <h1>Backup e troca de aparelho</h1>
      <p class="lead">
        Tudo fica só neste aparelho. O backup é um arquivo com as suas aulas, salas vazias e ajustes, para guardar ou levar para outro
        celular.
      </p>

      <section>
        <h2>Fazer backup</h2>
        <p>
          Este aparelho tem <strong>{what}</strong>.{' '}
          {st.ultimoBackup ? `Último backup: ${dateLong(Date.parse(st.ultimoBackup))}.` : 'Nenhum backup feito ainda.'}
        </p>
        <div class="row">
          <button class="btn btn-primary" onClick={send} disabled={nA + nS === 0}>
            <IconSend /> Enviar backup
          </button>
          <button class="btn" onClick={download} disabled={nA + nS === 0}>
            <IconDownload /> Baixar backup
          </button>
        </div>
        <p class="small soft">
          “Enviar” abre o menu do aparelho: mande para o seu próprio e-mail ou salve no Drive. O arquivo tem só números e os nomes de
          turma e disciplina. Nada de áudio.
        </p>
        <p class="small share-msg" role="status" aria-live="polite">
          {msg}
        </p>
      </section>

      <section>
        <h2>Restaurar</h2>
        {l.session ? (
          <p class="note">Há uma aula em andamento. Encerre a aula para restaurar um backup.</p>
        ) : (
          <>
            <p class="small">
              Junta o backup com o que já está aqui. Nada é apagado e nada é sobrescrito; dá para restaurar o mesmo arquivo de novo sem
              duplicar.
            </p>
            <label for="backup-file" class="btn">
              Escolher arquivo de backup
            </label>
            <input
              id="backup-file"
              class="visually-hidden"
              type="file"
              accept="application/json,.json,text/plain,.txt"
              onChange={(e) => {
                void onFile(e.currentTarget.files?.[0])
                e.currentTarget.value = ''
              }}
            />
            {fileErr && (
              <p class="note note-error" role="alert">
                {fileErr}
              </p>
            )}
            {done && (
              <p class="note" role="status">
                {done} <a href="#/aulas">Ver aulas</a>
              </p>
            )}
            {plan && (
              <div class="restore-plan" role="region" aria-label="Prévia da restauração">
                <p>
                  Backup {plan.criadoEm && `de ${dateShort(Date.parse(plan.criadoEm))}`}
                  {plan.aparelho && <span class="soft"> · {plan.aparelho}</span>}
                </p>
                <ul>
                  <li>
                    <strong>{plural(plan.novasAulas.length, 'aula nova', 'aulas novas')}</strong>
                    {plan.aulasRepetidas > 0 && `; ${plural(plan.aulasRepetidas, 'já está', 'já estão')} neste aparelho`}
                  </li>
                  <li>
                    <strong>{plural(plan.novasSalas.length, 'sala vazia nova', 'salas vazias novas')}</strong>
                    {plan.salasRepetidas > 0 && `; ${plural(plan.salasRepetidas, 'já está', 'já estão')} neste aparelho`}
                  </li>
                  {plan.invalidos > 0 && <li class="text-alto">{plural(plan.invalidos, 'item danificado', 'itens danificados')} no arquivo: vão ficar de fora.</li>}
                </ul>
                {plan.ajustes && (
                  <label class="check">
                    <input type="checkbox" checked={optAjustes} onChange={(e) => setOptAjustes(e.currentTarget.checked)} />
                    Trazer faixas, meta do semáforo, tema e som do backup
                  </label>
                )}
                {plan.calibracao && (
                  <>
                    <label class="check">
                      <input type="checkbox" checked={optCal} onChange={(e) => setOptCal(e.currentTarget.checked)} />
                      Usar a calibração do backup
                      {plan.calibracao.device && ` (${plan.calibracao.device})`}
                    </label>
                    <p class="small soft calib-warn">
                      A calibração vale para o microfone onde foi feita. Só marque se for o <strong>mesmo aparelho</strong> (por exemplo,
                      depois de limpar os dados). Em celular novo, calibre de novo. As aulas restauradas mantêm a calibração com que
                      foram medidas.
                    </p>
                  </>
                )}
                <div class="row">
                  <button
                    class="btn btn-primary"
                    onClick={() => void restore()}
                    disabled={plan.novasAulas.length + plan.novasSalas.length === 0 && !(optAjustes && plan.ajustes) && !(optCal && plan.calibracao)}
                  >
                    Restaurar
                  </button>
                  <button class="btn btn-quiet" onClick={() => setPlan(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <h2>Armazenamento</h2>
        <StorageStatus />
      </section>
    </div>
  )
}
