const validDtypes = ['fp32', 'fp16', 'q8', 'q4', 'q4f16'] as const;
const validDevices = ['wasm', 'webgpu', 'cpu'] as const;

type Dtype = typeof validDtypes[number];
type Device = typeof validDevices[number];

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

export function createWorkerHandler(postMessage: (msg: any) => void) {
  let tts: any = null;
  let modelReady = false;
  let modelError: string | null = null;
  let modelId = 'onnx-community/Kokoro-82M-v1.1-zh-ONNX';
  let modelDtype: Dtype = 'q8';
  let modelDevice: Device = 'cpu';
  let textStream: any = null;
  let currentStreamingId: string | null = null;
  let currentStreamPromise: Promise<void> | null = null;

  async function loadModel(): Promise<void> {
    const { KokoroTTS } = await import('kokoro-js');
    tts = await KokoroTTS.from_pretrained(modelId, { dtype: modelDtype, device: modelDevice });
  }

  function awaitModel(): Promise<void> {
    if (modelReady) return Promise.resolve();
    if (modelError) return Promise.reject(new Error(modelError));
    return new Promise<void>((resolve, reject) => {
      const check = setInterval(() => {
        if (modelReady) { clearInterval(check); resolve(); }
        if (modelError) { clearInterval(check); reject(new Error(modelError!)); }
      }, 100);
    });
  }

  return async function handleWorkerMessage(msg: any): Promise<void> {
    try {
      if (msg.type === 'init') {
        if (msg.modelId) modelId = msg.modelId;
        if (msg.dtype && validDtypes.includes(msg.dtype)) modelDtype = msg.dtype;
        if (msg.device && validDevices.includes(msg.device)) modelDevice = msg.device;
        try {
          await loadModel();
          modelReady = true;
          postMessage({ type: 'ready' });
        } catch (err: any) {
          modelError = err.message;
          postMessage({ type: 'error', error: err.message });
        }
        return;
      }

      if (msg.type === 'reconfigure') {
        if (msg.modelId) modelId = msg.modelId;
        if (msg.dtype && validDtypes.includes(msg.dtype)) modelDtype = msg.dtype;
        if (msg.device && validDevices.includes(msg.device)) modelDevice = msg.device;
        tts = null;
        modelReady = false;
        modelError = null;
        try {
          await loadModel();
          modelReady = true;
          postMessage({ type: 'ready' });
        } catch (err: any) {
          modelError = err.message;
          postMessage({ type: 'error', error: err.message });
        }
        return;
      }

      await awaitModel();

      if (msg.type === 'tts') {
        if (!msg.text) throw new Error(`TTS text is ${msg.text === null ? 'null' : 'undefined'}`);
        const audio = await tts.generate(msg.text, { voice: msg.voice, speed: msg.speed ?? 1.0 });
        postMessage({ id: msg.id, ok: true, result: rawAudioToWav(audio) });
      } else if (msg.type === 'voices') {
        const voices = Object.entries(tts.voices).map(([id, v]: [string, any]) => ({
          id, name: v.name, language: v.language, gender: v.gender,
        }));
        postMessage({ id: msg.id, ok: true, result: voices });
      } else if (msg.type === 'stream-start') {
        const { TextSplitterStream } = await import('kokoro-js');
        textStream = new TextSplitterStream();
        currentStreamingId = msg.streamingId;

        postMessage({ type: 'stream-started', streamingId: msg.streamingId });

        currentStreamPromise = (async () => {
          try {
            for await (const chunk of tts.stream(textStream, {
              voice: msg.voice,
              speed: msg.speed ?? 1.0,
            })) {
              postMessage({
                type: 'stream-chunk',
                streamingId: msg.streamingId,
                audio: rawAudioToWav(chunk.audio),
              });
            }
            postMessage({ type: 'stream-end', streamingId: msg.streamingId });
          } catch (err: any) {
            postMessage({
              type: 'stream-error',
              streamingId: msg.streamingId,
              error: err.message,
            });
          } finally {
            textStream = null;
            currentStreamingId = null;
            currentStreamPromise = null;
          }
        })();
      } else if (msg.type === 'stream-text' && textStream) {
        textStream.push(msg.text);
      } else if (msg.type === 'stream-finish' && textStream) {
        textStream.close();
      }
    } catch (err: any) {
      if (msg.id) {
        postMessage({ id: msg.id, ok: false, error: err.message });
      }
    }
  };
}

const handler = createWorkerHandler((msg) => {
  if (!process.send) return;
  const converted: any = {};
  for (const [k, v] of Object.entries(msg)) {
    converted[k] = v instanceof Uint8Array ? Array.from(v) : v;
  }
  process.send(converted);
});
process.on('message', handler);
