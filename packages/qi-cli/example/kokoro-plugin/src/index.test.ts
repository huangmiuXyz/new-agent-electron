import { describe, it, expect, vi } from 'vitest';
import { createStreamListener } from './stream-listener';
import { rawAudioToWav, stripWavHeader } from './utils';

function makeTestWav(samples: number[]): number[] {
  const float32 = new Float32Array(samples);
  const wav = rawAudioToWav({ audio: float32, sampling_rate: 24000 });
  return Array.from(wav);
}

describe('createStreamListener', () => {
  it('handleChunk accumulates PCM and queues audio blob', () => {
    const listener = createStreamListener();
    const controller = { fulfill: vi.fn(), error: vi.fn() };
    listener.setController(controller);

    const chunk1 = makeTestWav([0.1, -0.2, 0.3]);
    const chunk2 = makeTestWav([-0.4, 0.5]);

    listener.handleChunk(chunk1);
    listener.handleChunk(chunk2);

    // End to trigger fulfill
    listener.handleEnd();

    expect(controller.fulfill).toHaveBeenCalledOnce();
    expect(controller.error).not.toHaveBeenCalled();

    const fulfillArg = controller.fulfill.mock.calls[0];
    const wavBytes = fulfillArg[0];
    expect(wavBytes).toBeInstanceOf(Uint8Array);

    const decoded = stripWavHeader(wavBytes);
    expect(decoded.length).toBe(5);
    expect(decoded[0]).toBeCloseTo(0.1, 6);
    expect(decoded[1]).toBeCloseTo(-0.2, 6);
    expect(decoded[2]).toBeCloseTo(0.3, 6);
    expect(decoded[3]).toBeCloseTo(-0.4, 6);
    expect(decoded[4]).toBeCloseTo(0.5, 6);

    expect(fulfillArg[1]).toEqual({ audioMediaType: 'audio/wav' });
  });

  it('handleEnd with error calls controller.error', () => {
    const listener = createStreamListener();
    const controller = { fulfill: vi.fn(), error: vi.fn() };
    listener.setController(controller);

    listener.handleEnd('something went wrong');

    expect(controller.error).toHaveBeenCalledWith(new Error('something went wrong'));
    expect(controller.fulfill).not.toHaveBeenCalled();
  });

  it('handleChunk without controller is no-op', () => {
    const listener = createStreamListener();
    expect(() => listener.handleChunk(makeTestWav([1.0]))).not.toThrow();
  });

  it('handleEnd without controller is no-op', () => {
    const listener = createStreamListener();
    expect(() => listener.handleEnd()).not.toThrow();
  });

  it('handleEnd resets state for next stream', () => {
    const listener = createStreamListener();
    const controller = { fulfill: vi.fn(), error: vi.fn() };
    listener.setController(controller);

    const chunk = makeTestWav([0.5]);
    listener.handleChunk(chunk);
    listener.handleEnd();

    // Second stream with new controller
    const controller2 = { fulfill: vi.fn(), error: vi.fn() };
    listener.setController(controller2);
    listener.handleEnd();

    expect(controller2.fulfill).toHaveBeenCalledOnce();
    // First controller's fulfill should have been called with the combined data
    const fulfill1 = controller.fulfill.mock.calls[0][0];
    const decoded1 = stripWavHeader(fulfill1);
    expect(decoded1.length).toBe(1);
    expect(decoded1[0]).toBeCloseTo(0.5, 6);

    // Second fulfill should have empty data (no chunks in this stream)
    const fulfill2 = controller2.fulfill.mock.calls[0][0];
    const decoded2 = stripWavHeader(fulfill2);
    expect(decoded2.length).toBe(0);
  });

  it('reset clears state', () => {
    const listener = createStreamListener();
    const controller = { fulfill: vi.fn(), error: vi.fn() };
    listener.setController(controller);
    listener.handleChunk(makeTestWav([0.1]));
    listener.reset();

    // After reset, should need a new controller
    listener.handleChunk(makeTestWav([0.2]));
    listener.handleEnd();
    expect(controller.fulfill).not.toHaveBeenCalled();

    const controller2 = { fulfill: vi.fn(), error: vi.fn() };
    listener.setController(controller2);
    listener.handleEnd();
    expect(controller2.fulfill).toHaveBeenCalledOnce();
  });
});
