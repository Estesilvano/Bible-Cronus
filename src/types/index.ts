export interface PermissionSettings {
  allowFileRead: boolean;
  allowFileWrite: boolean;
  allowWebSearch: boolean;
  allowTaskExecution: boolean;
  requireConfirmationForWrites: boolean;
  requireConfirmationForDeletes: boolean;
}

export interface FileSnapshot {
  id: string;
  filepath: string;
  timestamp: number;
  contentBefore: string | null; // null if file was created
  contentAfter: string | null;  // null if file was deleted
  action: 'create' | 'update' | 'delete';
}

export type LLMProvider = 'groq' | 'openrouter' | 'huggingface' | 'puter' | '9router' | 'arena';

export interface ProviderConfig {
  id: LLMProvider;
  name: string;
  baseUrl: string;
  defaultModel: string;
  isFree: boolean;
  apiKey?: string;
  rateLimitHits: number;
  isAvailable: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: number;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
}

export interface ExecutionEvent {
  type: 'status' | 'tool_start' | 'tool_progress' | 'tool_end' | 'undo_ready' | 'error' | 'cancelled';
  message: string;
  data?: any;
  timestamp: number;
}
