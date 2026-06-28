export function rawAudioToWav(audio: { audio: Float32Array; sampling_rate: number }): Uint8Array {
  const numChannels = 1;
  const sampleRate = audio.sampling_rate;
  const bitsPerSample = 32;
  const data = audio.audio;
  const dataLength = data.length * 4;
  const header = new ArrayBuffer(44 + dataLength);
  const view = new DataView(header);
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
  view.setUint16(32, numChannels * bitsPerSample / 8, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLength, true);
  for (let i = 0; i < data.length; i++) view.setFloat32(44 + i * 4, data[i], true);
  return new Uint8Array(header);
}

export function splitSentences(text: string): { sentences: string[]; remainder: string } {
  const delim = /[。！？；：.!?;:\n]+/;
  const parts = text.split(delim);
  if (parts.length <= 1) return { sentences: [], remainder: text };
  const sentences = parts.slice(0, -1).map(s => s.trim()).filter(Boolean);
  const remainder = parts[parts.length - 1];
  return { sentences, remainder };
}

export function stripWavHeader(wav: Uint8Array): Float32Array {
  const sampleCount = (wav.length - 44) / 4;
  const result = new Float32Array(sampleCount);
  const view = new DataView(wav.buffer, wav.byteOffset + 44, wav.byteLength - 44);
  for (let i = 0; i < sampleCount; i++) {
    result[i] = view.getFloat32(i * 4, true);
  }
  return result;
}
