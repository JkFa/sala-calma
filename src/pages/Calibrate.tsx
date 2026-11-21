import { useState } from 'preact/hooks'
import { makeCalibration, QUIET_ROOM_DBA, MARGINS, type CalibrationMethod } from '../lib/calibration'
import { lesson, measureForCalibration } from '../state/lesson'
import { settings } from '../state/settings'
import { useStore } from '../state/store'
import { dateLong, dec } from '../ui/format'
import { MeterError } from '../audio/meter'
import { calibracaoSuspeita } from '../lib/calibration'
import { MicPicker } from '../ui/MicPicker'
import { BadCalibration } from './Measure'

const SECONDS = 10

function deviceLabel() {
  const ua = navigator.userAgent
  const m = ua.match(/\(([^)]+)\)/)
  return m ? m[1].split(';').slice(0, 3).join(';').trim() : ''
}

export function Calibrate() {
  const st = useStore(settings)
  const l = useStore(lesson)
  const [method, setMethod] = useState<CalibrationMethod>('medidor')
  const [ref, setRef] = useState('')
  const [phase, setPhase] = useState<'pronto' | 'medindo' | 'feito'>('pronto')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const cal = st.calibration

  const refValue = method === 'medidor' ? Number(ref.replace(',', '.')) : QUIET_ROOM_DBA
  const canStart = method === 'sala-silenciosa' || (ref.trim() !== '' && refValue >= 20 && refValue <= 130)

  const run = async () => {
    setError('')
    setPhase('medindo')
    setProgress(0)
    try {
      const { dbfs, mic } = await measureForCalibration(SECONDS, (f) => setProgress(Math.min(1, f)))
      const c = { ...makeCalibration(dbfs, refValue, method, new Date(), deviceLabel()), ...(mic ? { mic } : {}) }
      settings.set({ calibration: c })
      setPhase('feito')
    } catch (e) {
      setError(e instanceof MeterError || e instanceof Error ? e.message : 'Não deu certo. Tente de novo.')
      setPhase('pronto')
    }
  }

  if (l.session) {
    return (
      <div>
        <h1>Calibrar</h1>
        <p class="note">Há uma aula em andamento. Encerre a aula para calibrar o aparelho.</p>
      </div>
    )
  }

  return (
    <div class="calibrate">
      <h1>Calibrar este aparelho</h1>
      <p class="lead">
        Cada celular tem um microfone diferente. A calibração descobre quanto somar à leitura deste aparelho para chegar perto de
        um medidor de verdade. Leva uns 30 segundos e vale para este aparelho e este navegador.
      </p>

      {cal ? (
        <p class="note">
          Calibrado em {dateLong(Date.parse(cal.date))}, pelo método “{cal.method === 'medidor' ? 'medidor de referência' : 'sala silenciosa'}”.
          Margem estimada: ±{cal.margin} dB. Ajuste aplicado: {dec(cal.offset)} dB.{' '}
          <button class="btn btn-quiet" onClick={() => settings.set({ calibration: null })}>
            Remover calibração
          </button>
        </p>
      ) : (
        <p class="note note-warn">Ainda não calibrado. Por enquanto o app mostra só faixas relativas.</p>
      )}

      {calibracaoSuspeita(cal) && <BadCalibration />}
      <MicPicker />

      <fieldset class="methods">
        <legend>Como você quer calibrar?</legend>
        <label class="check method">
          <input type="radio" name="m" checked={method === 'medidor'} onChange={() => setMethod('medidor')} />
          <span>
            <strong>Com um medidor de referência</strong>
            <span class="hint">
              Decibelímetro da escola, do técnico de segurança, ou emprestado. Margem estimada: ±{MARGINS.medidor} dB.
            </span>
          </span>
        </label>
        <label class="check method">
          <input type="radio" name="m" checked={method === 'sala-silenciosa'} onChange={() => setMethod('sala-silenciosa')} />
          <span>
            <strong>Sem medidor, numa sala vazia e silenciosa</strong>
            <span class="hint">
              Assume {QUIET_ROOM_DBA} dB(A), o valor que a OMS recomenda para sala de aula vazia. Bem menos preciso: ±
              {MARGINS['sala-silenciosa']} dB.
            </span>
          </span>
        </label>
      </fieldset>

      <ol class="steps">
        {method === 'medidor' ? (
          <>
            <li>Coloque o celular e o medidor lado a lado, apontando para o mesmo lugar.</li>
            <li>Deixe um som constante no ambiente (ventilador, música em volume médio, conversa de fundo).</li>
            <li>Ajuste o medidor para ponderação A (dBA), resposta lenta (slow), e anote o valor que ele mostra.</li>
            <li>
              <div class="field ref-field">
                <label for="ref">Valor lido no medidor, em dB(A)</label>
                <input
                  id="ref"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="20"
                  max="130"
                  value={ref}
                  onInput={(e) => setRef(e.currentTarget.value)}
                />
              </div>
            </li>
            <li>Toque em “Medir {SECONDS} segundos” sem mudar o som do ambiente.</li>
          </>
        ) : (
          <>
            <li>Vá para uma sala vazia, de porta e janelas fechadas, sem ventilador ou ar-condicionado ligado.</li>
            <li>Deixe o celular sobre a mesa e fique em silêncio.</li>
            <li>Toque em “Medir {SECONDS} segundos”.</li>
          </>
        )}
      </ol>

      {phase === 'medindo' ? (
        <div class="cal-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Medindo">
          <span style={{ width: `${progress * 100}%` }} />
          <p class="small">Medindo… mantenha o som do ambiente igual.</p>
        </div>
      ) : (
        <button class="btn btn-primary btn-big" disabled={!canStart} onClick={run}>
          Medir {SECONDS} segundos
        </button>
      )}
      {method === 'medidor' && ref.trim() !== '' && !canStart && (
        <p class="small" style={{ color: 'var(--alto-text)' }}>
          Digite um valor entre 20 e 130 dB(A).
        </p>
      )}
      {error && (
        <p class="note note-error" role="alert">
          {error}
        </p>
      )}
      {phase === 'feito' && cal && (
        <p class="note" role="status">
          Pronto. Ajuste de {dec(cal.offset)} dB salvo. A partir de agora as aulas mostram dB(A) com margem de ±{cal.margin} dB.{' '}
          <a href="#/medir">Ir para Medir</a>
        </p>
      )}

      <hr />
      <h2>Por que isso importa</h2>
      <p>
        Sem calibração, dois celulares na mesma sala podem mostrar valores com 10 dB ou mais de diferença. Por isso o app não mostra
        “dB” enquanto o aparelho não for calibrado. Mesmo calibrado, ele não é um sonômetro profissional: o microfone do celular varia
        com a frequência e com a capinha.
      </p>
    </div>
  )
}
