/**
 * Medidor: microfone → ponderação A → nível por janela de 125 ms.
 *
 * Usa AudioWorklet quando disponível; senão, IIRFilterNode + AnalyserNode.
 * Em nenhum caminho o áudio é gravado: não há MediaRecorder, nem buffers
 * guardados. Só saem números (dBFS).
 */
import { WINDOW_MS } from '../config'
import { msToDbfs } from '../lib/levels'
import { designAWeighting } from './aweighting'
import workletUrl from './level-processor.js?url'

export interface LevelEvent {
  dbfsA: number
  dbfsZ: number
  peak: number
  /** epoch ms */
  t: number
}

export type MeterErrorCode =
  | 'sem-suporte'
  | 'precisa-https'
  | 'permissao-negada'
  | 'sem-microfone'
  | 'microfone-ocupado'
  | 'sem-sinal'
  | 'desconhecido'

export class MeterError extends Error {
  code: MeterErrorCode
  constructor(code: MeterErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/**
 * Sem processamento de voz (que achataria o nível). Não forçamos mono:
 * em notebooks com dois microfones, a mistura em mono pode anular o sinal.
 */
export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
  video: false,
}

/** Microfone escolhido pelo professor ('' = padrão do sistema). */
let preferredMic = ''
export function setPreferredMic(id: string) {
  preferredMic = id
}

function constraintsFor(deviceId: string): MediaStreamConstraints {
  if (!deviceId) return MIC_CONSTRAINTS
  return { ...MIC_CONSTRAINTS, audio: { ...(MIC_CONSTRAINTS.audio as MediaTrackConstraints), deviceId: { exact: deviceId } } }
}

export interface MicInfo {
  id: string
  label: string
}

/** Microfones disponíveis. Os nomes só aparecem depois da permissão. */
export async function listMics(): Promise<MicInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    const mics = all.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
    return mics.map((d, i) => ({ id: d.deviceId, label: d.label || `Microfone ${i + 1}` }))
  } catch {
    return []
  }
}

export const SILENT_MIC_MESSAGE =
  'O microfone não está captando o som da sala: o nível está parado. Em computadores, isso costuma acontecer quando o sistema usa a entrada de fone de ouvido (sem fone ligado) em vez do microfone embutido. Escolha outro microfone abaixo e use “Testar microfone”; confira também a tecla de mudo e a permissão de microfone do navegador.'

/** Abaixo disto (dBFS sem ponderação) não há sinal: microfone mudo ou bloqueado. */
export const SILENCE_DBFS = -100

export function explainError(e: unknown): MeterError {
  if (e instanceof MeterError) return e
  const name = (e as { name?: string })?.name ?? ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return new MeterError(
        'permissao-negada',
        'O navegador bloqueou o microfone. Toque no cadeado ao lado do endereço, libere o microfone e tente de novo. No iPhone: Ajustes › Safari › Microfone.',
      )
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new MeterError('sem-microfone', 'Não encontrei microfone neste aparelho.')
    case 'NotReadableError':
    case 'TrackStartError':
      return new MeterError(
        'microfone-ocupado',
        'O microfone está em uso por outro app (chamada, gravador, videoconferência). Feche o outro app e tente de novo.',
      )
    case 'SecurityError':
      return new MeterError('precisa-https', 'O microfone só funciona em endereço seguro (https).')
    default:
      return new MeterError('desconhecido', 'Não consegui ligar o microfone. Recarregue a página e tente de novo.')
  }
}

type AudioCtxCtor = typeof AudioContext

export class Meter {
  onLevel: (e: LevelEvent) => void = () => {}
  /** Chamado quando o microfone para sozinho (ex.: iOS em segundo plano). */
  onInterrupt: () => void = () => {}

  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private timer: number | null = null
  private nodes: AudioNode[] = []
  mode: 'worklet' | 'analyser' | null = null
  /** Nome do microfone em uso (vazio se o navegador não informar). */
  deviceLabel = ''

  get running() {
    return this.ctx !== null
  }

  async start(): Promise<void> {
    if (this.ctx) return
    if (!window.isSecureContext) {
      throw new MeterError('precisa-https', 'O microfone só funciona em endereço seguro (https).')
    }
    const Ctx: AudioCtxCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext
    if (!navigator.mediaDevices?.getUserMedia || !Ctx) {
      throw new MeterError('sem-suporte', 'Este navegador não permite medir pelo microfone. Use Chrome, Edge, Firefox ou Safari atualizados.')
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraintsFor(preferredMic))
    } catch (e) {
      const name = (e as { name?: string })?.name
      // O microfone escolhido sumiu (desconectado): volta para o padrão.
      if (preferredMic && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
        } catch (e2) {
          throw explainError(e2)
        }
      } else {
        throw explainError(e)
      }
    }
    this.deviceLabel = stream.getAudioTracks()[0]?.label ?? ''
    const ctx = new Ctx()
    this.ctx = ctx
    this.stream = stream
    try {
      if (ctx.state !== 'running') await ctx.resume()
      const src = ctx.createMediaStreamSource(stream)
      this.nodes.push(src)
      const sections = designAWeighting(ctx.sampleRate)
      const windowSamples = Math.round((ctx.sampleRate * WINDOW_MS) / 1000)
      if (ctx.audioWorklet) {
        await ctx.audioWorklet.addModule(workletUrl)
        const node = new AudioWorkletNode(ctx, 'level-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          channelCount: 2,
          channelCountMode: 'clamped-max',
          processorOptions: { sections, windowSamples },
        })
        node.port.onmessage = (ev: MessageEvent<[number, number, number]>) => {
          const [a, z, p] = ev.data
          this.onLevel({ dbfsA: msToDbfs(a), dbfsZ: msToDbfs(z), peak: p, t: Date.now() })
        }
        src.connect(node)
        this.nodes.push(node)
        this.mode = 'worklet'
      } else {
        this.startAnalyser(ctx, src, sections, windowSamples)
      }
    } catch (e) {
      this.stop()
      if (e instanceof MeterError) throw e
      throw new MeterError('desconhecido', 'Não consegui iniciar o processamento de áudio. Recarregue a página e tente de novo.')
    }

    for (const track of stream.getAudioTracks()) {
      track.addEventListener('ended', () => this.onInterrupt())
    }
    ctx.addEventListener('statechange', () => {
      if (ctx.state !== 'running' && this.ctx === ctx) this.onInterrupt()
    })
  }

  private startAnalyser(
    ctx: AudioContext,
    src: MediaStreamAudioSourceNode,
    sections: ReturnType<typeof designAWeighting>,
    windowSamples: number,
  ) {
    let last: AudioNode = src
    for (const q of sections) {
      const f = ctx.createIIRFilter([q.b0, q.b1, q.b2], [1, q.a1, q.a2])
      last.connect(f)
      this.nodes.push(f)
      last = f
    }
    const size = Math.min(32768, Math.pow(2, Math.ceil(Math.log2(windowSamples))))
    const anA = ctx.createAnalyser()
    const anZ = ctx.createAnalyser()
    anA.fftSize = size
    anZ.fftSize = size
    last.connect(anA)
    src.connect(anZ)
    this.nodes.push(anA, anZ)
    const bufA = new Float32Array(size)
    const bufZ = new Float32Array(size)
    const ms = (b: Float32Array) => {
      let s = 0
      for (let i = b.length - windowSamples; i < b.length; i++) s += b[i] * b[i]
      return s / windowSamples
    }
    this.timer = window.setInterval(() => {
      anA.getFloatTimeDomainData(bufA)
      anZ.getFloatTimeDomainData(bufZ)
      let peak = 0
      for (let i = 0; i < bufZ.length; i++) peak = Math.max(peak, Math.abs(bufZ[i]))
      this.onLevel({ dbfsA: msToDbfs(ms(bufA)), dbfsZ: msToDbfs(ms(bufZ)), peak, t: Date.now() })
      // Zera os buffers: nada de áudio fica na memória entre leituras.
      bufA.fill(0)
      bufZ.fill(0)
    }, WINDOW_MS)
    this.mode = 'analyser'
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    for (const n of this.nodes) {
      try {
        n.disconnect()
      } catch {
        /* já desconectado */
      }
    }
    this.nodes = []
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    const ctx = this.ctx
    this.ctx = null
    this.mode = null
    ctx?.close().catch(() => {})
  }
}
