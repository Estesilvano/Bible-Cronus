import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SafeSandbox, PermissionsManager } from '../src/sandbox/SafeSandbox.js';

describe('SafeSandbox and Undo System', () => {
  const testSandboxDir = path.resolve('./tmp_test_sandbox');

  beforeEach(() => {
    if (fs.existsSync(testSandboxDir)) {
      fs.rmSync(testSandboxDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testSandboxDir)) {
      fs.rmSync(testSandboxDir, { recursive: true, force: true });
    }
  });

  it('allows safe creation and reading of files within sandbox', () => {
    const sandbox = new SafeSandbox(testSandboxDir);
    sandbox.writeFile('test.txt', 'Hello Sandbox!');
    expect(sandbox.readFile('test.txt')).toBe('Hello Sandbox!');
  });

  it('prevents path traversal outside sandbox', () => {
    const sandbox = new SafeSandbox(testSandboxDir);
    expect(() => {
      sandbox.writeFile('../secret.txt', 'Hacked');
    }).toThrow(/Security Violation/);

    expect(() => {
      sandbox.readFile('../../etc/passwd');
    }).toThrow(/Security Violation/);
  });

  it('respects permission settings when read or write is disabled', () => {
    const perms = new PermissionsManager({ allowFileWrite: false });
    const sandbox = new SafeSandbox(testSandboxDir, perms);

    expect(() => {
      sandbox.writeFile('test.txt', 'content');
    }).toThrow(/Permission Denied: File write permission/);

    perms.updateSettings({ allowFileWrite: true, allowFileRead: false });
    sandbox.writeFile('test.txt', 'content');

    expect(() => {
      sandbox.readFile('test.txt');
    }).toThrow(/Permission Denied: File read permission/);
  });

  it('allows undoing file creation (removes file)', () => {
    const sandbox = new SafeSandbox(testSandboxDir);
    sandbox.writeFile('created.txt', 'Will be deleted on undo');
    expect(sandbox.readFile('created.txt')).toBe('Will be deleted on undo');

    const undoResult = sandbox.undoLastAction();
    expect(undoResult.undone).toBe(true);
    expect(undoResult.actionType).toBe('create');
    expect(() => sandbox.readFile('created.txt')).toThrow(/File not found/);
  });

  it('allows undoing file edit (restores prior content)', () => {
    const sandbox = new SafeSandbox(testSandboxDir);
    sandbox.writeFile('doc.txt', 'Version 1');
    sandbox.writeFile('doc.txt', 'Version 2');
    expect(sandbox.readFile('doc.txt')).toBe('Version 2');

    const undoResult = sandbox.undoLastAction();
    expect(undoResult.undone).toBe(true);
    expect(undoResult.actionType).toBe('update');
    expect(sandbox.readFile('doc.txt')).toBe('Version 1');
  });

  it('allows undoing file deletion (restores deleted file)', () => {
    const sandbox = new SafeSandbox(testSandboxDir);
    sandbox.writeFile('important.txt', 'Critical Data');
    sandbox.deleteFile('important.txt');
    expect(() => sandbox.readFile('important.txt')).toThrow(/File not found/);

    const undoResult = sandbox.undoLastAction();
    expect(undoResult.undone).toBe(true);
    expect(undoResult.actionType).toBe('delete');
    expect(sandbox.readFile('important.txt')).toBe('Critical Data');
  });
});
