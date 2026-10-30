export interface PermissionSettings {
  allowFileRead: boolean;
  allowFileWrite: boolean;
  allowWebSearch: boolean;
  allowTaskExecution: boolean;
  requireConfirmationForWrites: boolean;
  requireConfirmationForDeletes: boolean;
}

export class PermissionsManager {
  private settings: PermissionSettings;

  constructor(initialSettings?: Partial<PermissionSettings>) {
    this.settings = {
      allowFileRead: true,
      allowFileWrite: true,
      allowWebSearch: true,
      allowTaskExecution: true,
      requireConfirmationForWrites: false,
      requireConfirmationForDeletes: true,
      ...initialSettings,
    };
  }

  public getSettings(): PermissionSettings {
    return { ...this.settings };
  }

  public updateSettings(newSettings: Partial<PermissionSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
  }

  public canRead(): boolean {
    return this.settings.allowFileRead;
  }

  public canWrite(): boolean {
    return this.settings.allowFileWrite;
  }

  public canSearch(): boolean {
    return this.settings.allowWebSearch;
  }

  public canExecuteTask(): boolean {
    return this.settings.allowTaskExecution;
  }

  public requiresConfirmationFor(action: 'write' | 'delete'): boolean {
    if (action === 'write') return this.settings.requireConfirmationForWrites;
    if (action === 'delete') return this.settings.requireConfirmationForDeletes;
    return false;
  }
}
