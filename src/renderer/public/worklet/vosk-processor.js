class VoskProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]

    if (!input || input.length === 0) return true

    const channel = input[0]
    this.port.postMessage(channel)

    return true
  }
}

registerProcessor('vosk-processor', VoskProcessor)
