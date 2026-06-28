import { describe, it, expect, vi } from 'vitest';
import { createMainRouter } from './main';

describe('createMainRouter', () => {
  it('handleTTS posts message and resolves with worker response', async () => {
    const postMessage = vi.fn();
    const broadcast = vi.fn();
    const router = createMainRouter({ postMessage, broadcast });

    const promise = router.handleTTS({ text: 'hello', voice: 'af_heart', speed: 1.0 });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tts', text: 'hello', voice: 'af_heart', speed: 1.0 }),
    );

    const msg = postMessage.mock.calls[0][0];
    router.handleWorkerMessage({ id: msg.id, ok: true, result: 'wav-data' });

    const result = await promise;
    expect(result).toBe('wav-data');
  });

  it('handleVoices posts message and resolves', async () => {
    const postMessage = vi.fn();
    const broadcast = vi.fn();
    const router = createMainRouter({ postMessage, broadcast });

    const promise = router.handleVoices();
    const msg = postMessage.mock.calls[0][0];
    expect(msg.type).toBe('voices');

    router.handleWorkerMessage({ id: msg.id, ok: true, result: ['voice1'] });
    expect(await promise).toEqual(['voice1']);
  });

  it('handleStreamStart posts stream-start and resolves on stream-started', async () => {
    const postMessage = vi.fn();
    const broadcast = vi.fn();
    const router = createMainRouter({ postMessage, broadcast });

    const promise = router.handleStreamStart({ voice: 'af_heart', speed: 1.0 });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stream-start', voice: 'af_heart', speed: 1.0 }),
    );

    const msg = postMessage.mock.calls[0][0];
    expect(msg.streamingId).toBeDefined();

    router.handleWorkerMessage({ type: 'stream-started', streamingId: msg.streamingId });

    const streamingId = await promise;
    expect(streamingId).toBe(msg.streamingId);
  });

  it('handleStreamText posts stream-text', () => {
    const postMessage = vi.fn();
    const broadcast = vi.fn();
    const router = createMainRouter({ postMessage, broadcast });

    router.handleStreamText({ text: 'hello' });

    expect(postMessage).toHaveBeenCalledWith({ type: 'stream-text', text: 'hello' });
  });

  it('handleStreamFinish posts stream-finish and resolves on stream-end', async () => {
    const postMessage = vi.fn();
    const broadcast = vi.fn();
    const router = createMainRouter({ postMessage, broadcast });

    const promise = router.handleStreamFinish();

    expect(postMessage).toHaveBeenCalledWith({ type: 'stream-finish' });

    router.handleWorkerMessage({ type: 'stream-end', streamingId: 'test' });

    await expect(promise).resolves.toBeUndefined();
  });

  it('handleWorkerMessage: stream-chunk broadcasts tts-stream-chunk', () => {
    const postMessage = vi.fn();
    const broadcast = vi.fn();
    const router = createMainRouter({ postMessage, broadcast });

    router.handleWorkerMessage({
      type: 'stream-chunk',
      streamingId: 'test-1',
      audio: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
    });

    expect(broadcast).toHaveBeenCalledWith('tts-stream-chunk', {
      streamingId: 'test-1',
      audio: [0x52, 0x49, 0x46, 0x46],
    });
  });

  it('handleWorkerMessage: stream-end broadcasts and resolves streaming', async () => {
    const postMessage = vi.fn();
    const broadcast = vi.fn();
    const router = createMainRouter({ postMessage, broadcast });

    const promise = router.handleStreamFinish();
    router.handleWorkerMessage({ type: 'stream-end', streamingId: 'test-1' });

    expect(broadcast).toHaveBeenCalledWith('tts-stream-end', {
      streamingId: 'test-1',
    });

    await expect(promise).resolves.toBeUndefined();
  });

  it('handleWorkerMessage: stream-error broadcasts with error message', async () => {
    const postMessage = vi.fn();
    const broadcast = vi.fn();
    const router = createMainRouter({ postMessage, broadcast });

    const promise = router.handleStreamFinish();
    router.handleWorkerMessage({
      type: 'stream-error',
      streamingId: 'test-1',
      error: 'something broke',
    });

    expect(broadcast).toHaveBeenCalledWith('tts-stream-end', {
      streamingId: 'test-1',
      error: 'something broke',
    });

    await expect(promise).rejects.toThrow('something broke');
  });
});
