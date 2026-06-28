import { rawAudioToWav, stripWavHeader } from './utils';

export function createStreamListener() {
  let controller: any = null;
  let accumulatedSamples: Float32Array[] = [];
  let sampleRate = 24000;
  let audioQueue: Blob[] = [];
  let isPlayingAudio = false;

  function doReset() {
    controller = null;
    accumulatedSamples = [];
    audioQueue = [];
    isPlayingAudio = false;
  }

  function playNextAudio() {
    if (isPlayingAudio || audioQueue.length === 0) return;
    if (typeof Audio === 'undefined') return;
    isPlayingAudio = true;
    const blob = audioQueue.shift()!;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      isPlayingAudio = false;
      playNextAudio();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      isPlayingAudio = false;
      playNextAudio();
    };
    audio.play().catch(() => {
      URL.revokeObjectURL(url);
      isPlayingAudio = false;
      playNextAudio();
    });
  }

  return {
    setController(c: any) { controller = c; },

    handleChunk(audioArr: number[]) {
      if (!controller) return;
      const wav = new Uint8Array(audioArr);
      const blob = new Blob([wav], { type: 'audio/wav' });
      audioQueue.push(blob);
      playNextAudio();

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
