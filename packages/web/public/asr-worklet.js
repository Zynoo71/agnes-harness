// Capture PCM at the actual AudioContext sample rate, downsample to 16 kHz.
class AsrCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.sum = 0
    this.count = 0
    this.phase = 0
    this.samples = []
    this.finished = false
    this.port.onmessage = () => {
      if (this.finished) return
      this.finished = true
      this.flush()
      this.port.postMessage('flushed')
    }
  }
  flush() {
    if (!this.samples.length) return
    const bytes = new ArrayBuffer(this.samples.length * 2)
    const view = new DataView(bytes)
    this.samples.forEach((value, index) => {
      view.setInt16(index * 2, value, true)
    })
    this.port.postMessage(bytes, [bytes])
    this.samples = []
  }
  process(inputs) {
    if (this.finished) return false
    const input = inputs[0]?.[0]
    if (!input) return true
    for (const value of input) {
      this.sum += value
      this.count++
      this.phase += 16000
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate
        const sample = Math.max(-1, Math.min(1, this.sum / this.count))
        this.samples.push(Math.round(sample * (sample < 0 ? 32768 : 32767)))
        this.sum = 0
        this.count = 0
        if (this.samples.length === 3200) this.flush()
      }
    }
    return true
  }
}
registerProcessor('agh-asr', AsrCapture)
