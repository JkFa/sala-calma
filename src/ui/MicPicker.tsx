/**
 * Escolha e teste do microfone. Computadores costumam ter mais de uma
 * entrada (embutido, fone de ouvido, webcam), e o sistema às vezes usa a
 * do fone mesmo sem fone ligado: aí só chega chiado e o nível fica parado.
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import { listMics, Meter, type MicInfo } from '../audio/meter'
import { lesson, switchMic } from '../state/lesson'
import { settings } from '../state/settings'
import { useStore } from '../state/store'

const TEST_MS = 8000
/** Variação mínima (dB) para considerar que o microfone reage ao som. */
const TEST_MIN_SWING = 10

type TestState =
  | { phase: 'parado' }
  | { phase: 'testando'; level: number; min: number; max: number }
  | { phase: 'ok' | 'falhou'; mic: string; swing: number }
  | { phase: 'erro'; message: string }

function MicTest({ onDone }: { onDone: () => void }) {
  const [st, setSt] = useState<TestState>({ phase: 'parado' })
  const meter = useRef<Meter | null>(null)

  useEffect(() => () => meter.current?.stop(), [])

  const run = async () => {
    const m = new Meter()
    meter.current = m
    let min = Infinity
    let max = -Infinity
    m.onLevel = (e) => {
      min = Math.min(min, e.dbfsA)
      max = Math.max(max, e.dbfsA)
      setSt({ phase: 'testando', level: e.dbfsA, min, max })
    }
    setSt({ phase: 'testando', level: -120, min, max })
    try {
      await m.start()
    } catch (e) {
      setSt({ phase: 'erro', message: (e as Error).message })
      return
    }
    setTimeout(() => {
      const mic = m.deviceLabel
      m.stop()
      const swing = Number.isFinite(max - min) ? max - min : 0
      setSt({ phase: swing >= TEST_MIN_SWING ? 'ok' : 'falhou', mic, swing })
      onDone()
    }, TEST_MS)
  }

  if (st.phase === 'testando') {
    const pos = Math.min(100, Math.max(0, ((st.level + 90) / 80) * 100))
    return (
      <div class="mic-test" role="status">
        <p class="small">
          <strong>Bata palmas ou fale perto do aparelho.</strong> A barra deve pular.
        </p>
        <div class="mic-test-bar" aria-hidden="true">
          <span style={{ width: `${pos}%` }} />
        </div>
      </div>
    )
  }
  return (
    <div class="mic-test">
      <button type="button" class="btn" onClick={() => void run()}>
        Testar microfone
      </button>
      {st.phase === 'ok' && (
        <p class="small text-calmo" role="status">
          Funcionando: “{st.mic || 'microfone'}” captou o som (variação de {Math.round(st.swing)} dB).
        </p>
      )}
      {st.phase === 'falhou' && (
        <p class="small text-alto" role="alert">
          “{st.mic || 'Este microfone'}” não reagiu ao som (variação de só {Math.round(st.swing)} dB). Escolha outro microfone na lista
          e teste de novo. Em computadores, a entrada de fone de ouvido sem fone ligado só capta chiado.
        </p>
      )}
      {st.phase === 'erro' && (
        <p class="small text-alto" role="alert">
          {st.message}
        </p>
      )}
    </div>
  )
}

export function MicPicker() {
  const st = useStore(settings)
  const l = useStore(lesson)
  const [mics, setMics] = useState<MicInfo[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const upd = () => void listMics().then(setMics)
    upd()
    navigator.mediaDevices?.addEventListener?.('devicechange', upd)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', upd)
  }, [l.status, tick])

  const canTest = !l.session
  return (
    <div class="field mic-picker">
      {mics.length > 1 || st.microfoneId ? (
        <>
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
        </>
      ) : (
        l.microfone && <p class="small soft">Microfone: {l.microfone}</p>
      )}
      {canTest && <MicTest onDone={() => setTick((n) => n + 1)} />}
    </div>
  )
}
