import { useState } from 'preact/hooks'
import { SHARE_MESSAGE, shareFile, shareText, type ShareResult } from '../lib/share'
import { IconSend } from './icons'

/**
 * "Enviar para a coordenação" (arquivo + resumo) e "Compartilhar resumo"
 * (só texto). O arquivo é montado na hora do toque, sem await antes do
 * compartilhamento (o Safari exige isso).
 */
export function ShareButtons({
  file,
  text,
  title,
  sendLabel = 'Enviar para a coordenação',
}: {
  file: () => { name: string; json: string }
  text: string
  title: string
  sendLabel?: string
}) {
  const [msg, setMsg] = useState('')
  const show = (r: ShareResult) => setMsg(SHARE_MESSAGE[r])

  return (
    <div class="share">
      <div class="row">
        <button
          class="btn btn-primary"
          onClick={() => {
            const f = file()
            void shareFile({ ...f, text, title }).then(show)
          }}
        >
          <IconSend /> {sendLabel}
        </button>
        <button class="btn" onClick={() => void shareText(text, title).then(show)}>
          Compartilhar resumo
        </button>
      </div>
      <p class="small" role="status" aria-live="polite">
        {msg}
      </p>
    </div>
  )
}
