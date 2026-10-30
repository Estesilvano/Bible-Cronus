import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { HermesAgent } from '../src/agent/HermesAgent.js';
import { SafeSandbox } from '../src/sandbox/SafeSandbox.js';
import { FreeLLMRouter } from '../src/router/FreeLLMRouter.js';
import { ExecutionEvent } from '../src/types/index.js';

describe('HermesAgent Core', () => {
  const testDir = path.resolve('./tmp_hermes_test');
  let sandbox: SafeSandbox;
  let router: FreeLLMRouter;
  let agent: HermesAgent;

  beforeEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    sandbox = new SafeSandbox(testDir);
    router = new FreeLLMRouter();
    agent = new HermesAgent(sandbox, router);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('emits real-time events during execution and allows undoing actions', async () => {
    const events: ExecutionEvent[] = [];
    agent.onEvent((ev) => events.push(ev));

    vi.spyOn(router, 'completeChat')
      .mockResolvedValueOnce({
        text: 'Vou criar o arquivo de notas:\n[TOOL:write_file filepath="notas.txt"]Reunião às 14h[/TOOL]',
        providerUsed: 'groq',
        model: 'llama-3.3-70b-versatile',
      })
      .mockResolvedValueOnce({
        text: 'Arquivo notas.txt criado com sucesso.',
        providerUsed: 'groq',
        model: 'llama-3.3-70b-versatile',
      });

    const reply = await agent.runPrompt('Crie um arquivo com notas');
    expect(reply).toContain('Arquivo notas.txt criado');
    expect(sandbox.readFile('notas.txt')).toBe('Reunião às 14h');

    // Verify events emitted
    expect(events.some((e) => e.type === 'tool_start')).toBe(true);
    expect(events.some((e) => e.type === 'undo_ready')).toBe(true);

    // Verify undo
    const undoRes = agent.undoLastAction();
    expect(undoRes.undone).toBe(true);
    expect(() => sandbox.readFile('notas.txt')).toThrow(/File not found/);
  });

  it('supports task cancellation', async () => {
    vi.spyOn(router, 'completeChat').mockImplementation(async (_msgs, options) => {
      // Simulate delay and abort check
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve({ text: 'Done', providerUsed: 'groq', model: 'default' });
        }, 100);

        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Operação cancelada pelo usuário.'));
          });
        }
      });
    });

    const runPromise = agent.runPrompt('Demorada');
    agent.cancelCurrentTask();

    const result = await runPromise;
    expect(result).toContain('cancelada');
  });
});
