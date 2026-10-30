import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserSafeSandbox } from '../src/sandbox/BrowserSafeSandbox.js';
import { PermissionsManager } from '../src/sandbox/PermissionsManager.js';

describe('BrowserSafeSandbox for Mobile App', () => {
  let sandbox: BrowserSafeSandbox;
  const store: Record<string, string> = {};

  beforeEach(() => {
    // Mock localStorage
    Object.keys(store).forEach((k) => delete store[k]);
    global.localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
      key: (idx: number) => Object.keys(store)[idx] ?? null,
      get length() {
        return Object.keys(store).length;
      },
    } as any;

    sandbox = new BrowserSafeSandbox();
  });

  it('safely creates and reads files in sandboxed localStorage', () => {
    sandbox.writeFile('hello.txt', 'Conteúdo seguro');
    expect(sandbox.readFile('hello.txt')).toBe('Conteúdo seguro');
    expect(sandbox.listFiles()).toContain('hello.txt');
  });

  it('sanitizes traversal paths', () => {
    sandbox.writeFile('../outside.txt', 'safe test');
    expect(sandbox.listFiles()).toContain('outside.txt');
  });

  it('supports undoing operations on mobile sandbox', () => {
    sandbox.writeFile('doc.txt', 'Primeira Versão');
    sandbox.writeFile('doc.txt', 'Segunda Versão');
    expect(sandbox.readFile('doc.txt')).toBe('Segunda Versão');

    const res = sandbox.undoLastAction();
    expect(res.undone).toBe(true);
    expect(res.actionType).toBe('update');
    expect(sandbox.readFile('doc.txt')).toBe('Primeira Versão');
  });

  it('respects permission locks in mobile environment', () => {
    const perms = new PermissionsManager({ allowFileWrite: false });
    const restrictedSandbox = new BrowserSafeSandbox(perms);

    expect(() => restrictedSandbox.writeFile('test.txt', '123')).toThrow(/Permission Denied/);
  });
});
