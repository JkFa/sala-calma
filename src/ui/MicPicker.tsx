/** Escolha do microfone (computadores costumam ter mais de um). */
import { useEffect, useState } from 'preact/hooks'
import { listMics, type MicInfo } from '../audio/meter'
import { lesson, switchMic } from '../state/lesson'
import { settings } from '../state/settings'
import { useStore } from '../state/store'

export function MicPicker() {
  const st = useStore(settings)
  const l = useStore(lesson)
  const [mics, setMics] = useState<MicInfo[]>([])

  useEffect(() => {
    const upd = () => void listMics().then(setMics)
    upd()
    navigator.mediaDevices?.addEventListener?.('devicechange', upd)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', upd)
  }, [l.status])

  if (mics.length < 2 && !st.microfoneId) {
    return l.microfone ? <p class="small soft mic-current">Microfone: {l.microfone}</p> : null
  }
  return (
    <div class="field mic-picker">
      <label for="mic">
        Microfone <span class="hint">se o nível não se mexe, tente outro</span>
      </label>
      <select id="mic" value={st.microfoneId} onChange={(e) => void switchMic(e.currentTarget.value)}>
        <option value="">Padrão do sistema</option>
        {mics.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  )
}
