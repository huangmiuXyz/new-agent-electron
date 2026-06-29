import { rawAudioToWav, stripWavHeader } from './utils';

export function createStreamListener() {
  let controller: any = null;
  let accumulatedSamples: Float32Array[] = [];
  let sampleRate = 24000;

  function doReset() {
    controller = null;
    accumulatedSamples = [];
  }

  return {
    setController(c: any) { controller = c; },

    async handleChunk(audioArr: number[]) {
      if (!controller) return;
      const wav = new Uint8Array(audioArr);

      await controller.append(wav, { audioMediaType: 'audio/wav' });

      const pcm = stripWavHeader(wav);
      accumulatedSamples.push(pcm);
    },

    handleEnd(error?: string) {
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
