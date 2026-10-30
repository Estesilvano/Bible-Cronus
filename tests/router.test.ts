import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FreeLLMRouter } from '../src/router/FreeLLMRouter.js';

describe('FreeLLMRouter', () => {
  let router: FreeLLMRouter;

  beforeEach(() => {
    router = new FreeLLMRouter();
    vi.restoreAllMocks();
  });

  it('initializes with free providers list including groq, openrouter, arena, puter, huggingface, 9router', () => {
    const providers = router.getProviders();
    expect(providers.map((p) => p.id)).toEqual(
      expect.arrayContaining(['groq', 'openrouter', 'arena', 'puter', 'huggingface', '9router'])
    );
  });

  it('selects coding priority models when taskType is coding', () => {
    const best = router.selectBestProvider('coding');
    expect(['arena', 'groq', 'openrouter']).toContain(best);
  });

  it('falls back to the next provider when the primary one fails', async () => {
    let callCount = 0;
    // Mock global fetch: fail first call (e.g. groq), succeed second call (e.g. openrouter)
    global.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          text: () => Promise.resolve('Rate limit exceeded'),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Fallback Response from Second Provider' } }],
          }),
      });
    });

    const result = await router.completeChat([{ role: 'user', content: 'Hello' }]);
    expect(result.text).toBe('Fallback Response from Second Provider');
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it('respects abort signal for cancellation', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      router.completeChat([{ role: 'user', content: 'Test' }], { signal: controller.signal })
    ).rejects.toThrow(/aborted/);
  });
});
