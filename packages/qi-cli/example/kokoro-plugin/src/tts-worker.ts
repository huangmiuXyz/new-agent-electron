import { parentPort } from 'worker_threads';

function rawAudioToWav(audio: { audio: Float32Array; sampling_rate: number }): Uint8Array {
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

let tts: any = null;
let modelReady = false;
let modelError: string | null = null;

(async () => {
  try {
    const { KokoroTTS } = await import('kokoro-js');
    const modelId = 'onnx-community/Kokoro-82M-v1.1-zh-ONNX';
    tts = await KokoroTTS.from_pretrained(modelId, { dtype: 'q8', device: 'cpu' });
    modelReady = true;
    parentPort!.postMessage({ type: 'ready' });
  } catch (err: any) {
    modelError = err.message;
    parentPort!.postMessage({ type: 'error', error: err.message });
  }
})();

parentPort!.on('message', async (msg: { id: string; type: string; text?: string; voice?: string; speed?: number }) => {
  try {
    if (modelError) throw new Error(modelError);
    if (!modelReady) {
      await new Promise<void>((resolve, reject) => {
        const check = setInterval(() => {
          if (modelReady) { clearInterval(check); resolve(); }
          if (modelError) { clearInterval(check); reject(new Error(modelError!)); }
        }, 100);
      });
    }

    if (msg.type === 'tts') {
      const audio = await tts.generate(msg.text!, { voice: msg.voice as any, speed: msg.speed ?? 1.0 });
      const wav = rawAudioToWav(audio);
      parentPort!.postMessage({ id: msg.id, ok: true, result: wav });
    } else if (msg.type === 'voices') {
      const voices = Object.entries(tts.voices).map(([id, v]: [string, any]) => ({
        id, name: v.name, language: v.language, gender: v.gender,
      }));
      parentPort!.postMessage({ id: msg.id, ok: true, result: voices });
    }
  } catch (err: any) {
    parentPort!.postMessage({ id: msg.id, ok: false, error: err.message });
  }
});
