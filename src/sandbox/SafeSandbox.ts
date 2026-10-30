import * as fs from 'fs';
import * as path from 'path';
import { PermissionSettings, FileSnapshot } from '../types/index.js';
import { PermissionsManager } from './PermissionsManager.js';
import { ISandboxStorage } from './BrowserSafeSandbox.js';

export { PermissionsManager };

export class UndoManager {
  private history: FileSnapshot[] = [];
  private maxHistory: number = 50;

  public pushSnapshot(snapshot: FileSnapshot): void {
    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  public getHistory(): FileSnapshot[] {
    return [...this.history];
  }

  public getLatestSnapshot(): FileSnapshot | undefined {
    return this.history[this.history.length - 1];
  }

  public popSnapshot(): FileSnapshot | undefined {
    return this.history.pop();
  }

  public clear(): void {
    this.history = [];
  }
}

export class SafeSandbox implements ISandboxStorage {
  private readonly rootDir: string;
  private permissions: PermissionsManager;
  private undoManager: UndoManager;

  constructor(
    sandboxDir: string = './sandbox_workspace',
    permissions?: PermissionsManager,
    undoManager?: UndoManager
  ) {
    this.rootDir = path.resolve(sandboxDir);
    this.permissions = permissions || new PermissionsManager();
    this.undoManager = undoManager || new UndoManager();

    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true });
    }
  }

  public getSandboxDir(): string {
    return this.rootDir;
  }

  public getPermissionsManager(): PermissionsManager {
    return this.permissions;
  }

  public getUndoManager(): UndoManager {
    return this.undoManager;
  }

  public resolveSafePath(relativePath: string): string {
    if (relativePath.indexOf('\0') !== -1) {
      throw new Error('Path traversal detected: invalid path containing null byte');
    }
    const resolved = path.resolve(this.rootDir, relativePath);
    if (!resolved.startsWith(this.rootDir)) {
      throw new Error(`Security Violation: Access denied to path outside isolated sandbox: ${relativePath}`);
    }
    return resolved;
  }

  public readFile(relativePath: string): string {
    if (!this.permissions.canRead()) {
      throw new Error('Permission Denied: File read permission is disabled by user.');
    }
    const safePath = this.resolveSafePath(relativePath);
    if (!fs.existsSync(safePath)) {
      throw new Error(`File not found in sandbox: ${relativePath}`);
    }
    const stat = fs.statSync(safePath);
    if (stat.isDirectory()) {
      throw new Error(`Cannot read file: ${relativePath} is a directory`);
    }
    return fs.readFileSync(safePath, 'utf-8');
  }

  public writeFile(relativePath: string, content: string): { success: boolean; snapshotId: string } {
    if (!this.permissions.canWrite()) {
      throw new Error('Permission Denied: File write permission is disabled by user.');
    }
    const safePath = this.resolveSafePath(relativePath);
    const exists = fs.existsSync(safePath);
    const previousContent = exists ? fs.readFileSync(safePath, 'utf-8') : null;

    const parentDir = path.dirname(safePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(safePath, content, 'utf-8');

    const snapshot: FileSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      filepath: relativePath,
      timestamp: Date.now(),
      contentBefore: previousContent,
      contentAfter: content,
      action: exists ? 'update' : 'create',
    };
    this.undoManager.pushSnapshot(snapshot);

    return { success: true, snapshotId: snapshot.id };
  }

  public deleteFile(relativePath: string): { success: boolean; snapshotId: string } {
    if (!this.permissions.canWrite()) {
      throw new Error('Permission Denied: File write/delete permission is disabled by user.');
    }
    const safePath = this.resolveSafePath(relativePath);
    if (!fs.existsSync(safePath)) {
      throw new Error(`Cannot delete: File does not exist in sandbox: ${relativePath}`);
    }

    const previousContent = fs.readFileSync(safePath, 'utf-8');
    fs.unlinkSync(safePath);

    const snapshot: FileSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      filepath: relativePath,
      timestamp: Date.now(),
      contentBefore: previousContent,
      contentAfter: null,
      action: 'delete',
    };
    this.undoManager.pushSnapshot(snapshot);

    return { success: true, snapshotId: snapshot.id };
  }

  public listFiles(subDir: string = ''): string[] {
    if (!this.permissions.canRead()) {
      throw new Error('Permission Denied: File read permission is disabled by user.');
    }
    const safePath = this.resolveSafePath(subDir);
    if (!fs.existsSync(safePath)) {
      return [];
    }
    return fs.readdirSync(safePath);
  }

  public undoLastAction(): { undone: boolean; restoredFile?: string; actionType?: string } {
    const lastSnapshot = this.undoManager.popSnapshot();
    if (!lastSnapshot) {
      return { undone: false };
    }

    const safePath = this.resolveSafePath(lastSnapshot.filepath);

    if (lastSnapshot.action === 'create') {
      if (fs.existsSync(safePath)) {
        fs.unlinkSync(safePath);
      }
    } else if (lastSnapshot.action === 'update') {
      if (lastSnapshot.contentBefore !== null) {
        fs.writeFileSync(safePath, lastSnapshot.contentBefore, 'utf-8');
      }
    } else if (lastSnapshot.action === 'delete') {
      if (lastSnapshot.contentBefore !== null) {
        const parentDir = path.dirname(safePath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(safePath, lastSnapshot.contentBefore, 'utf-8');
      }
    }

    return {
      undone: true,
      restoredFile: lastSnapshot.filepath,
      actionType: lastSnapshot.action,
    };
  }
}
