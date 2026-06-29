import { rawAudioToWav, stripWavHeader } from './utils';

export function createStreamListener() {
  let controller: any = null;
  let accumulatedSamples: Float32Array[] = [];
  let sampleRate = 24000;
  let currentStreamingId: string | null = null;

  function doReset() {
    controller = null;
    accumulatedSamples = [];
    currentStreamingId = null;
  }

  return {
    get streamingId() { return currentStreamingId; },
    get hasActive() { return controller !== null; },

    setController(streamingId: string, c: any) {
      controller = c;
      currentStreamingId = streamingId;
    },

    async handleChunk(_streamingId: string, audioArr: number[]) {
      if (!controller) return;
      const wav = new Uint8Array(audioArr);

      await controller.append(wav, { audioMediaType: 'audio/wav' });

      const pcm = stripWavHeader(wav);
      accumulatedSamples.push(pcm);
    },

    handleEnd(_streamingId: string, error?: string) {
      if (!controller) return;
      if (error) {
        controller.error(new Error(error));
      } else {
        const totalLen = accumulatedSamples.reduce((sum, arr) => sum + arr.length, 0);
        const combined = new Float32Array(totalLen);
        let offset = 0;
        for (const arr of accumulatedSamples) {
          combined.set(arr, offset);
          offset += arr.length;
        }
        const wavBytes = rawAudioToWav({ audio: combined, sampling_rate: sampleRate });
        controller.fulfill(wavBytes, { audioMediaType: 'audio/wav' });
      }
      doReset();
    },

    reset: doReset,
  };
}
