import { PermissionsManager } from './PermissionsManager.js';
import { FileSnapshot } from '../types/index.js';

export { PermissionsManager };

export interface ISandboxStorage {
  readFile(filepath: string): string;
  writeFile(filepath: string, content: string): { success: boolean; snapshotId: string };
  deleteFile(filepath: string): { success: boolean; snapshotId: string };
  listFiles(subDir?: string): string[];
  undoLastAction(): { undone: boolean; restoredFile?: string; actionType?: string };
  getPermissionsManager(): PermissionsManager;
}

export class BrowserSafeSandbox implements ISandboxStorage {
  private prefix = 'opencode_sandbox_';
  private permissions: PermissionsManager;
  private history: FileSnapshot[] = [];

  constructor(permissions?: PermissionsManager) {
    this.permissions = permissions || new PermissionsManager();
  }

  public getPermissionsManager(): PermissionsManager {
    return this.permissions;
  }

  private cleanPath(filepath: string): string {
    return filepath.replace(/^(\.\/|\/)+/, '').replace(/\.\.\//g, '');
  }

  public readFile(filepath: string): string {
    if (!this.permissions.canRead()) {
      throw new Error('Permission Denied: Leitura bloqueada.');
    }
    const clean = this.cleanPath(filepath);
    const key = this.prefix + clean;
    const val = localStorage.getItem(key);
    if (val === null) {
      throw new Error(`Arquivo não encontrado no sandbox: ${clean}`);
    }
    return val;
  }

  public writeFile(filepath: string, content: string): { success: boolean; snapshotId: string } {
    if (!this.permissions.canWrite()) {
      throw new Error('Permission Denied: Escrita bloqueada.');
    }
    const clean = this.cleanPath(filepath);
    const key = this.prefix + clean;
    const previous = localStorage.getItem(key);

    localStorage.setItem(key, content);

    const snapshot: FileSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      filepath: clean,
      timestamp: Date.now(),
      contentBefore: previous,
      contentAfter: content,
      action: previous !== null ? 'update' : 'create',
    };
    this.history.push(snapshot);
    return { success: true, snapshotId: snapshot.id };
  }

  public deleteFile(filepath: string): { success: boolean; snapshotId: string } {
    if (!this.permissions.canWrite()) {
      throw new Error('Permission Denied: Escrita/remoção bloqueada.');
    }
    const clean = this.cleanPath(filepath);
    const key = this.prefix + clean;
    const previous = localStorage.getItem(key);
    if (previous === null) {
      throw new Error(`Arquivo não existe: ${clean}`);
    }

    localStorage.removeItem(key);

    const snapshot: FileSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      filepath: clean,
      timestamp: Date.now(),
      contentBefore: previous,
      contentAfter: null,
      action: 'delete',
    };
    this.history.push(snapshot);
    return { success: true, snapshotId: snapshot.id };
  }

  public listFiles(): string[] {
    if (!this.permissions.canRead()) {
      throw new Error('Permission Denied: Leitura bloqueada.');
    }
    const files: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(this.prefix)) {
        files.push(k.replace(this.prefix, ''));
      }
    }
    return files;
  }

  public undoLastAction(): { undone: boolean; restoredFile?: string; actionType?: string } {
    const last = this.history.pop();
    if (!last) return { undone: false };

    const key = this.prefix + last.filepath;
    if (last.action === 'create') {
      localStorage.removeItem(key);
    } else if (last.action === 'update' && last.contentBefore !== null) {
      localStorage.setItem(key, last.contentBefore);
    } else if (last.action === 'delete' && last.contentBefore !== null) {
      localStorage.setItem(key, last.contentBefore);
    }

    return {
      undone: true,
      restoredFile: last.filepath,
      actionType: last.action,
    };
  }
}
