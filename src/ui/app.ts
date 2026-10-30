import { ISandboxStorage, BrowserSafeSandbox } from '../sandbox/BrowserSafeSandbox.js';
import { FreeLLMRouter } from '../router/FreeLLMRouter.js';
import { HermesAgent } from '../agent/HermesAgent.js';
import { ExecutionEvent, LLMProvider } from '../types/index.js';

class AppController {
  private sandbox: ISandboxStorage;
  private router: FreeLLMRouter;
  private agent: HermesAgent;

  constructor() {
    this.sandbox = new BrowserSafeSandbox();
    this.router = new FreeLLMRouter();
    // Use the sandbox interface
    this.agent = new HermesAgent(this.sandbox as any, this.router);
    this.bindEvents();
    this.renderProviders();
    this.renderFiles();
  }

  private bindEvents() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = (e.currentTarget as HTMLElement).dataset.tab;
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

        (e.currentTarget as HTMLElement).classList.add('active');
        if (target) {
          document.getElementById(target)?.classList.add('active');
        }
      });
    });

    // Chat submit
    const sendBtn = document.getElementById('btn-send');
    const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;

    const handleSend = async () => {
      const text = promptInput?.value.trim();
      if (!text) return;

      this.appendChatMessage('user', text);
      promptInput.value = '';
      this.toggleCancelButton(true);

      try {
        const reply = await this.agent.runPrompt(text);
        this.appendChatMessage('assistant', reply);
      } catch (err: any) {
        this.appendChatMessage('system', `Erro: ${err.message}`);
      } finally {
        this.toggleCancelButton(false);
        this.renderFiles();
      }
    };

    sendBtn?.addEventListener('click', handleSend);
    promptInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    // Undo button
    document.getElementById('btn-undo')?.addEventListener('click', () => {
      const res = this.agent.undoLastAction();
      if (res.undone) {
        this.appendLog('warn', `↩️ Desfeito: ${res.actionType} no arquivo ${res.restoredFile}`);
        this.renderFiles();
      } else {
        alert('Nenhuma ação recente para desfazer no sandbox.');
      }
    });

    // Cancel button
    document.getElementById('btn-cancel')?.addEventListener('click', () => {
      this.agent.cancelCurrentTask();
      this.toggleCancelButton(false);
    });

    // Refresh files
    document.getElementById('btn-refresh-files')?.addEventListener('click', () => {
      this.renderFiles();
    });

    // Settings Modal
    const modal = document.getElementById('modal-settings');
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      modal?.classList.remove('hidden');
    });
    document.getElementById('btn-close-modal')?.addEventListener('click', () => {
      modal?.classList.add('hidden');
    });
    document.getElementById('btn-save-settings')?.addEventListener('click', () => {
      const allowRead = (document.getElementById('perm-read') as HTMLInputElement).checked;
      const allowWrite = (document.getElementById('perm-write') as HTMLInputElement).checked;
      const allowSearch = (document.getElementById('perm-search') as HTMLInputElement).checked;
      const confirmDel = (document.getElementById('perm-confirm-del') as HTMLInputElement).checked;

      this.sandbox.getPermissionsManager().updateSettings({
        allowFileRead: allowRead,
        allowFileWrite: allowWrite,
        allowWebSearch: allowSearch,
        requireConfirmationForDeletes: confirmDel,
      });

      this.appendLog('info', 'Permissões atualizadas com sucesso pelo usuário.');
      modal?.classList.add('hidden');
    });

    // Clear logs
    document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
      const logArea = document.getElementById('activity-log');
      if (logArea) logArea.innerHTML = '';
    });

    // Agent Real-Time events
    this.agent.onEvent((ev: ExecutionEvent) => {
      const typeClass =
        ev.type === 'error'
          ? 'log-error'
          : ev.type === 'tool_end' || ev.type === 'undo_ready'
          ? 'log-success'
          : ev.type === 'tool_start'
          ? 'log-warn'
          : 'log-info';

      this.appendLog(typeClass, `[${new Date(ev.timestamp).toLocaleTimeString()}] ${ev.message}`);
    });
  }

  private appendChatMessage(role: 'user' | 'assistant' | 'system', text: string) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `message ${role}-msg`;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  private appendLog(styleClass: string, message: string) {
    const logArea = document.getElementById('activity-log');
    if (!logArea) return;

    const entry = document.createElement('div');
    entry.className = `log-entry ${styleClass}`;
    entry.textContent = message;
    logArea.appendChild(entry);
    logArea.scrollTop = logArea.scrollHeight;
  }

  private toggleCancelButton(active: boolean) {
    const cancelBtn = document.getElementById('btn-cancel') as HTMLButtonElement;
    if (cancelBtn) {
      cancelBtn.disabled = !active;
    }
  }

  private renderFiles() {
    const list = document.getElementById('file-list');
    if (!list) return;

    try {
      const files = this.sandbox.listFiles();
      if (files.length === 0) {
        list.innerHTML = '<p class="empty-state">Nenhum arquivo criado na pasta isolada ainda.</p>';
        return;
      }

      list.innerHTML = files
        .map(
          (f) => `
        <div class="file-item">
          <span>📄 ${f}</span>
          <button class="btn btn-secondary btn-sm" onclick="alert('Visualização segura do arquivo')">Ver</button>
        </div>
      `
        )
        .join('');
    } catch (err: any) {
      list.innerHTML = `<p class="empty-state" style="color:red">Acesso restrito: ${err.message}</p>`;
    }
  }

  private renderProviders() {
    const container = document.getElementById('providers-list');
    if (!container) return;

    const providers = this.router.getProviders();
    container.innerHTML = providers
      .map(
        (p) => `
      <div class="provider-card">
        <div class="provider-header">
          <strong>${p.name}</strong>
          <span class="tag-free">100% Gratuito</span>
        </div>
        <p style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 8px;">Modelo: <code>${p.defaultModel}</code></p>
        <div style="display:flex; gap:8px;">
          <input type="password" placeholder="Chave de API (opcional para fallback)" id="key-${p.id}" value="${p.apiKey || ''}" style="flex:1; padding:6px; border-radius:4px; background:#0f172a; border:1px solid #334155; color:#fff;" />
          <button class="btn btn-secondary btn-sm" data-provider-id="${p.id}">Salvar</button>
        </div>
      </div>
    `
      )
      .join('');

    container.querySelectorAll('button[data-provider-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.providerId as LLMProvider;
        const input = document.getElementById(`key-${id}`) as HTMLInputElement;
        if (input && id) {
          this.router.setApiKey(id, input.value.trim());
          alert(`Chave para ${id} atualizada com sucesso!`);
        }
      });
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new AppController();
});
