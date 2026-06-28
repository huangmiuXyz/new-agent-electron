import { describe, it, expect, beforeAll } from 'vitest';
import { createWorkerHandler } from './tts-worker';
import { splitSentences, rawAudioToWav, stripWavHeader } from './utils';

describe('splitSentences', () => {
  it('returns empty when no delimiter', () => {
    expect(splitSentences('hello')).toEqual({ sentences: [], remainder: 'hello' });
  });

  it('splits on Chinese period', () => {
    expect(splitSentences('你好。世界。')).toEqual({ sentences: ['你好', '世界'], remainder: '' });
  });

  it('keeps incomplete trailing text', () => {
    expect(splitSentences('Hello。World is')).toEqual({ sentences: ['Hello'], remainder: 'World is' });
  });

  it('handles consecutive delimiters', () => {
    expect(splitSentences('A。B。。C。')).toEqual({ sentences: ['A', 'B', 'C'], remainder: '' });
  });
});

describe('rawAudioToWav + stripWavHeader roundtrip', () => {
  it('roundtrips Float32Array through WAV', () => {
    const original = new Float32Array([0.1, -0.5, 0.3, 1.0, -1.0, 0.0]);
    const wav = rawAudioToWav({ audio: original, sampling_rate: 24000 });
    expect(wav.length).toBe(44 + original.length * 4);
    const decoded = stripWavHeader(wav);
    expect(decoded.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(decoded[i]).toBeCloseTo(original[i], 6);
    }
  });

  it('creates valid WAV header', () => {
    const samples = new Float32Array(100);
    const wav = rawAudioToWav({ audio: samples, sampling_rate: 48000 });
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(3);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(32);
  });
});

describe('kokoro-js real model (模型可能需下载 ≥10s)', () => {
  let tts: any;

  beforeAll(async () => {
    const { KokoroTTS } = await import('kokoro-js');
    tts = await KokoroTTS.from_pretrained(
      'onnx-community/Kokoro-82M-v1.1-zh-ONNX',
      { device: 'cpu', dtype: 'q8' },
    );
  }, 120_000);

  it('generate produces valid WAV audio', async () => {
    const result = await tts.generate('你好世界。', { voice: 'af_heart', speed: 1.0 });
    expect(result.audio).toBeInstanceOf(Float32Array);
    expect(result.audio.length).toBeGreaterThan(0);
    expect(result.sampling_rate).toBe(24000);

    const wav = rawAudioToWav(result);
    expect(wav[0]).toBe(0x52);
    expect(wav[1]).toBe(0x49);
    expect(wav[2]).toBe(0x46);
    expect(wav[3]).toBe(0x46);
    expect(wav.length).toBe(44 + result.audio.length * 4);

    const decoded = stripWavHeader(wav);
    expect(decoded.length).toBe(result.audio.length);
    for (let i = 0; i < result.audio.length; i++) {
      expect(decoded[i]).toBe(result.audio[i]);
    }
  }, 60_000);

  it('stream() with TextSplitterStream yields progressive audio', async () => {
    const { TextSplitterStream } = await import('kokoro-js');
    const textStream = new TextSplitterStream();

    const chunks: { audio: Float32Array; sampling_rate: number }[] = [];
    const streamPromise = (async () => {
      for await (const chunk of tts.stream(textStream, { voice: 'af_heart', speed: 1.0 })) {
        chunks.push(chunk);
      }
    })();

    textStream.push('你好');
    await new Promise(r => setTimeout(r, 50));
    textStream.push('世界。');
    await new Promise(r => setTimeout(r, 50));
    textStream.push('今天天气真');
    await new Promise(r => setTimeout(r, 50));
    textStream.push('好。');
    await new Promise(r => setTimeout(r, 50));
    textStream.close();

    await streamPromise;

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of chunks) {
      expect(chunk.audio).toBeInstanceOf(Object);
      expect(chunk.audio.audio).toBeInstanceOf(Float32Array);
      expect(chunk.audio.audio.length).toBeGreaterThan(0);
      expect(chunk.audio.sampling_rate).toBe(24000);
    }

    const totalSamples = chunks.reduce((sum, c) => sum + c.audio.audio.length, 0);
    expect(totalSamples).toBeGreaterThan(0);
  }, 120_000);

  it('createWorkerHandler streams text→audio chunks with valid WAV', async () => {
    const messages: any[] = [];
    const handler = createWorkerHandler((msg) => { messages.push(msg); });

    await handler({ type: 'init' });
    const initMsg = messages.find((m: any) => m.type === 'ready' || m.type === 'error');
    if (!initMsg || initMsg.type === 'error') {
      throw new Error(initMsg ? `init error: ${initMsg.error}` : 'init never responded');
    }
    messages.length = 0;

    await handler({
      type: 'stream-start', streamingId: 'test-1',
      voice: 'af_heart', speed: 1.0,
    });

    await waitFor(() => messages.some((m: any) => m.type === 'stream-started'));

    handler({ type: 'stream-text', text: 'Hello world.' });
    handler({ type: 'stream-text', text: 'How are you?' });
    handler({ type: 'stream-finish' });

    await waitFor(() => messages.some((m: any) => m.type === 'stream-end' || m.type === 'stream-error'));

    const errMsg = messages.find((m: any) => m.type === 'stream-error');
    if (errMsg) throw new Error(`stream-error: ${errMsg.error}`);

    const endMsg = messages.find((m: any) => m.type === 'stream-end');
    expect(endMsg).toBeDefined();
    expect(endMsg.streamingId).toBe('test-1');

    const chunks = messages.filter((m: any) => m.type === 'stream-chunk');
    expect(chunks.length).toBeGreaterThanOrEqual(1);

    for (const chunk of chunks) {
      expect(chunk.audio).toBeInstanceOf(Uint8Array);
      expect(chunk.audio.length).toBeGreaterThan(0);
      expect(chunk.audio[0]).toBe(0x52);
      expect(chunk.audio[1]).toBe(0x49);
      expect(chunk.audio[2]).toBe(0x46);
      expect(chunk.audio[3]).toBe(0x46);
    }
  }, 180_000);
});

function waitFor(condition: () => boolean, timeout = 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = setInterval(() => {
      if (condition()) { clearInterval(check); clearTimeout(t); resolve(); }
    }, 10);
    const t = setTimeout(() => {
      clearInterval(check);
      reject(new Error('waitFor timeout'));
    }, timeout);
  });
}
