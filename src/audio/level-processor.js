/* global AudioWorkletProcessor, registerProcessor */
/**
 * AudioWorklet do Sala Calma.
 *
 * Recebe o sinal do microfone, aplica a ponderação A (biquads calculados
 * na thread principal) e, a cada janela, envia SOMENTE três números:
 * média quadrática ponderada A, média quadrática sem ponderação e pico.
 * As amostras de áudio nunca saem deste processador nem são guardadas.
 */
class LevelProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const { sections, windowSamples } = options.processorOptions
    this.q = sections
    this.z1 = new Float64Array(sections.length)
    this.z2 = new Float64Array(sections.length)
    this.win = windowSamples
    this.n = 0
    this.sumA = 0
    this.sumZ = 0
    this.peak = 0
  }

  process(inputs) {
    const input = inputs[0]
    const ch = input && input[0]
    if (!ch) return true
    const q = this.q
    const z1 = this.z1
    const z2 = this.z2
    for (let k = 0; k < ch.length; k++) {
      const x = ch[k]
      let y = x
      for (let i = 0; i < q.length; i++) {
        const s = q[i]
        const out = s.b0 * y + z1[i]
        z1[i] = s.b1 * y - s.a1 * out + z2[i]
        z2[i] = s.b2 * y - s.a2 * out
        y = out
      }
      this.sumA += y * y
      this.sumZ += x * x
      const ax = x < 0 ? -x : x
      if (ax > this.peak) this.peak = ax
      if (++this.n >= this.win) {
        this.port.postMessage([this.sumA / this.n, this.sumZ / this.n, this.peak])
        this.n = 0
        this.sumA = 0
        this.sumZ = 0
        this.peak = 0
      }
    }
    return true
  }
}

registerProcessor('level-processor', LevelProcessor)
