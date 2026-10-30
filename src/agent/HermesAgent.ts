import { ISandboxStorage } from '../sandbox/BrowserSafeSandbox.js';
import { FreeLLMRouter } from '../router/FreeLLMRouter.js';
import { ChatMessage, ExecutionEvent, ToolCall } from '../types/index.js';

export type EventListener = (event: ExecutionEvent) => void;

export class HermesAgent {
  private sandbox: ISandboxStorage;
  private router: FreeLLMRouter;
  private eventListeners: EventListener[] = [];
  private conversationHistory: ChatMessage[] = [];
  private currentAbortController: AbortController | null = null;

  constructor(sandbox: ISandboxStorage, router: FreeLLMRouter) {
    this.sandbox = sandbox;
    this.router = router;
  }

  public onEvent(listener: EventListener): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== listener);
    };
  }

  private emit(event: ExecutionEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in event listener:', err);
      }
    }
  }

  public getHistory(): ChatMessage[] {
    return [...this.conversationHistory];
  }

  public cancelCurrentTask(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
      this.emit({
        type: 'cancelled',
        message: 'Ação cancelada pelo usuário.',
        timestamp: Date.now(),
      });
    }
  }

  public undoLastAction(): { undone: boolean; restoredFile?: string; actionType?: string } {
    const result = this.sandbox.undoLastAction();
    if (result.undone) {
      this.emit({
        type: 'undo_ready',
        message: `Desfeita última alteração: ${result.actionType} no arquivo ${result.restoredFile}`,
        data: result,
        timestamp: Date.now(),
      });
    }
    return result;
  }

  public async performWebSearch(query: string, signal?: AbortSignal): Promise<string> {
    if (!this.sandbox.getPermissionsManager().canSearch()) {
      throw new Error('Permissão de busca negada pelo usuário.');
    }
    this.emit({
      type: 'tool_start',
      message: `Buscando na web por: "${query}"`,
      timestamp: Date.now(),
    });

    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);
      const data: any = await res.json();
      const results: string[] = [];

      if (data.AbstractText) {
        results.push(`Resumo: ${data.AbstractText}`);
      }
      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, 5)) {
          if (topic.Text) results.push(topic.Text);
        }
      }

      const answer = results.length > 0 ? results.join('\n\n') : `Nenhum resultado direto encontrado para "${query}".`;
      this.emit({
        type: 'tool_end',
        message: `Busca concluída. ${results.length} resultados encontrados.`,
        timestamp: Date.now(),
      });
      return answer;
    } catch (err: any) {
      this.emit({
        type: 'error',
        message: `Erro na busca: ${err.message}`,
        timestamp: Date.now(),
      });
      return `Erro ao realizar busca: ${err.message}`;
    }
  }

  public async runPrompt(userPrompt: string): Promise<string> {
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    this.conversationHistory.push({
      role: 'user',
      content: userPrompt,
      timestamp: Date.now(),
    });

    this.emit({
      type: 'status',
      message: 'Analisando pedido do usuário e planejando ações...',
      timestamp: Date.now(),
    });

    const systemPrompt = `Você é o Hermes OpenCode Agent, um assistente autônomo, seguro, prestativo e confiável em ambiente Android isolado.
Suas diretrizes fundamentais:
1. Você JAMAIS deseja o mal do usuário, mantendo total integridade e segurança.
2. Todo arquivo modificado fica estritamente na pasta isolada (sandbox) do app.
3. Se precisar interagir com arquivos, use o formato de ferramenta:
   [TOOL:read_file filepath="nome"]
   [TOOL:write_file filepath="nome"]CONTEÚDO[/TOOL]
   [TOOL:delete_file filepath="nome"]
   [TOOL:list_files]
   [TOOL:web_search query="termo"]
4. Sempre que executar uma ferramenta, explique de forma clara e amigável ao usuário.
5. Seja direto, resolutivo e mantenha o usuário atualizado em tempo real.`;

    const messagesToSend: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory,
    ];

    try {
      let turns = 0;
      const maxTurns = 5;

      while (turns < maxTurns) {
        turns++;
        if (signal.aborted) {
          throw new Error('Operação cancelada pelo usuário.');
        }

        const completion = await this.router.completeChat(messagesToSend, {
          taskType: 'general',
          signal,
        });

        const assistantReply = completion.text;
        const toolCalls = this.parseToolCalls(assistantReply);

        if (toolCalls.length === 0) {
          this.conversationHistory.push({
            role: 'assistant',
            content: assistantReply,
            timestamp: Date.now(),
          });
          this.emit({
            type: 'status',
            message: 'Tarefa concluída com sucesso.',
            timestamp: Date.now(),
          });
          return assistantReply;
        }

        for (const tool of toolCalls) {
          if (signal.aborted) throw new Error('Operação cancelada pelo usuário.');
          const result = await this.executeToolCall(tool, signal);
          messagesToSend.push({
            role: 'tool',
            content: `Tool ${tool.name} result:\n${result}`,
          });
        }
      }

      return 'Processo concluído após iterações.';
    } catch (err: any) {
      if (err.name === 'AbortError' || signal.aborted) {
        return 'Ação cancelada pelo usuário.';
      }
      this.emit({
        type: 'error',
        message: `Falha na execução: ${err.message}`,
        timestamp: Date.now(),
      });
      throw err;
    } finally {
      this.currentAbortController = null;
    }
  }

  private parseToolCalls(text: string): ToolCall[] {
    const tools: ToolCall[] = [];

    const writeRegex = /\[TOOL:write_file\s+filepath="([^"]+)"\]([\s\S]*?)\[\/TOOL\]/g;
    let match;
    while ((match = writeRegex.exec(text)) !== null) {
      tools.push({
        id: `t_${Date.now()}_${Math.random()}`,
        name: 'write_file',
        arguments: { filepath: match[1], content: match[2] },
        status: 'pending',
      });
    }

    const readRegex = /\[TOOL:read_file\s+filepath="([^"]+)"\]/g;
    while ((match = readRegex.exec(text)) !== null) {
      tools.push({
        id: `t_${Date.now()}_${Math.random()}`,
        name: 'read_file',
        arguments: { filepath: match[1] },
        status: 'pending',
      });
    }

    const delRegex = /\[TOOL:delete_file\s+filepath="([^"]+)"\]/g;
    while ((match = delRegex.exec(text)) !== null) {
      tools.push({
        id: `t_${Date.now()}_${Math.random()}`,
        name: 'delete_file',
        arguments: { filepath: match[1] },
        status: 'pending',
      });
    }

    if (text.includes('[TOOL:list_files]')) {
      tools.push({
        id: `t_${Date.now()}_${Math.random()}`,
        name: 'list_files',
        arguments: {},
        status: 'pending',
      });
    }

    const searchRegex = /\[TOOL:web_search\s+query="([^"]+)"\]/g;
    while ((match = searchRegex.exec(text)) !== null) {
      tools.push({
        id: `t_${Date.now()}_${Math.random()}`,
        name: 'web_search',
        arguments: { query: match[1] },
        status: 'pending',
      });
    }

    return tools;
  }

  private async executeToolCall(tool: ToolCall, signal?: AbortSignal): Promise<string> {
    this.emit({
      type: 'tool_start',
      message: `Executando: ${tool.name} ${JSON.stringify(tool.arguments)}`,
      timestamp: Date.now(),
    });

    try {
      let resultStr = '';
      if (tool.name === 'write_file') {
        const res = this.sandbox.writeFile(tool.arguments.filepath, tool.arguments.content);
        resultStr = `Arquivo salvo com sucesso no sandbox (Snapshot: ${res.snapshotId}).`;
        this.emit({
          type: 'undo_ready',
          message: `Arquivo salvo: ${tool.arguments.filepath} (Desfazer disponível)`,
          timestamp: Date.now(),
        });
      } else if (tool.name === 'read_file') {
        resultStr = this.sandbox.readFile(tool.arguments.filepath);
      } else if (tool.name === 'delete_file') {
        this.sandbox.deleteFile(tool.arguments.filepath);
        resultStr = `Arquivo excluído com sucesso do sandbox.`;
      } else if (tool.name === 'list_files') {
        const files = this.sandbox.listFiles();
        resultStr = JSON.stringify(files);
      } else if (tool.name === 'web_search') {
        resultStr = await this.performWebSearch(tool.arguments.query, signal);
      }

      this.emit({
        type: 'tool_end',
        message: `Sucesso: ${tool.name}`,
        timestamp: Date.now(),
      });
      return resultStr;
    } catch (err: any) {
      this.emit({
        type: 'error',
        message: `Falha em ${tool.name}: ${err.message}`,
        timestamp: Date.now(),
      });
      return `Erro ao executar ${tool.name}: ${err.message}`;
    }
  }
}
