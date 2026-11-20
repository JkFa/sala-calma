// Gera um WAV de 90 s que imita o som de uma sala de aula (ruído rosa com
// variação lenta + rajadas tipo fala). Usado só no teste e2e/screenshots.
import { writeFileSync } from 'node:fs'
const fs = 48000, secs = 90, n = fs * secs
const data = new Int16Array(n)
let b0 = 0, b1 = 0, b2 = 0, seed = 7
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1
for (let i = 0; i < n; i++) {
  const t = i / fs
  const w = rnd()
  b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913
  const pink = (b0 + b1 + b2 + w * 0.1848) * 0.11
  // Fundo que sobe e desce (conversa paralela), em dB
  const bgDb = -50 + 8 * Math.sin((2 * Math.PI * t) / 45) + 4 * Math.sin((2 * Math.PI * t) / 11)
  // "Fala" do professor: rajadas de 3 s a cada 8 s
  const speech = (t % 8) < 3 ? 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t) : 0
  const voice = speech * 0.05 * Math.sin(2 * Math.PI * 180 * t) * (1 + 0.5 * Math.sin(2 * Math.PI * 360 * t))
  const v = pink * Math.pow(10, bgDb / 20) * 3 + voice
  data[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)))
}
const h = Buffer.alloc(44)
h.write('RIFF', 0); h.writeUInt32LE(36 + n * 2, 4); h.write('WAVE', 8); h.write('fmt ', 12)
h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(fs, 24)
h.writeUInt32LE(fs * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(n * 2, 40)
writeFileSync(process.argv[2] ?? 'sala.wav', Buffer.concat([h, Buffer.from(data.buffer)]))
