/* global AudioWorkletProcessor, registerProcessor */
/**
 * AudioWorklet do Sala Calma.
 *
 * Recebe o sinal do microfone, aplica a ponderação A (biquads calculados
 * na thread principal) e, a cada janela, envia SOMENTE três números:
 * média quadrática ponderada A, média quadrática sem ponderação e pico.
 * As amostras de áudio nunca saem deste processador nem são guardadas.
 *
 * Mede cada canal em separado e usa o mais forte. Alguns notebooks têm
 * dois microfones com um deles em fase invertida: somar os canais em mono
 * faz um anular o outro, e o medidor ficaria quase mudo.
 */
const MAX_CH = 2

class LevelProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const { sections, windowSamples } = options.processorOptions
    this.q = sections
    this.z1 = Array.from({ length: MAX_CH }, () => new Float64Array(sections.length))
    this.z2 = Array.from({ length: MAX_CH }, () => new Float64Array(sections.length))
    this.win = windowSamples
    this.n = 0
    this.sumA = new Float64Array(MAX_CH)
    this.sumZ = new Float64Array(MAX_CH)
    this.peak = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const nch = Math.min(MAX_CH, input.length)
    const len = input[0].length
    const q = this.q
    let k = 0
    while (k < len) {
      const take = Math.min(len - k, this.win - this.n)
      for (let c = 0; c < nch; c++) {
        const ch = input[c]
        const z1 = this.z1[c]
        const z2 = this.z2[c]
        let sA = 0
        let sZ = 0
        let pk = this.peak
        for (let j = k; j < k + take; j++) {
          const x = ch[j]
          let y = x
          for (let i = 0; i < q.length; i++) {
            const s = q[i]
            const out = s.b0 * y + z1[i]
            z1[i] = s.b1 * y - s.a1 * out + z2[i]
            z2[i] = s.b2 * y - s.a2 * out
            y = out
          }
          sA += y * y
          sZ += x * x
          const ax = x < 0 ? -x : x
          if (ax > pk) pk = ax
        }
        this.sumA[c] += sA
        this.sumZ[c] += sZ
        this.peak = pk
      }
      this.n += take
      k += take
      if (this.n >= this.win) {
        let best = 0
        for (let c = 1; c < nch; c++) if (this.sumA[c] > this.sumA[best]) best = c
        this.port.postMessage([this.sumA[best] / this.n, this.sumZ[best] / this.n, this.peak])
        this.n = 0
        this.sumA.fill(0)
        this.sumZ.fill(0)
        this.peak = 0
      }
    }
    return true
  }
}

registerProcessor('level-processor', LevelProcessor)
