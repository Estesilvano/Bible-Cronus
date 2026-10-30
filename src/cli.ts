import * as readline from 'readline';
import { SafeSandbox } from './sandbox/SafeSandbox.js';
import { FreeLLMRouter } from './router/FreeLLMRouter.js';
import { HermesAgent } from './agent/HermesAgent.js';

export async function runCLI() {
  const sandbox = new SafeSandbox();
  const router = new FreeLLMRouter();
  const agent = new HermesAgent(sandbox, router);

  console.log('========================================================');
  console.log('🤖 OpenCode CLI Agent (Hermes Sandbox Engine for Android)');
  console.log('🔒 Sandbox Ativado: Somente pasta local autorizada');
  console.log('🌐 Provedores Gratuitos: Groq, LMSYS Arena, OpenRouter, Puter, HF, 9router');
  console.log('Comandos especiais: /undo, /cancel, /perms, /files, /exit');
  console.log('========================================================\n');

  agent.onEvent((ev) => {
    const time = new Date(ev.timestamp).toLocaleTimeString();
    if (ev.type === 'tool_start') {
      console.log(`\x1b[33m[${time}] ⚙️ ${ev.message}\x1b[0m`);
    } else if (ev.type === 'undo_ready') {
      console.log(`\x1b[32m[${time}] ↩️ ${ev.message}\x1b[0m`);
    } else if (ev.type === 'error') {
      console.log(`\x1b[31m[${time}] ❌ ${ev.message}\x1b[0m`);
    } else if (ev.type === 'cancelled') {
      console.log(`\x1b[35m[${time}] ⏹️ ${ev.message}\x1b[0m`);
    } else {
      console.log(`\x1b[36m[${time}] ℹ️ ${ev.message}\x1b[0m`);
    }
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = () => {
    rl.question('\nVocê > ', async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        promptUser();
        return;
      }

      if (trimmed === '/exit') {
        console.log('Encerrando OpenCode Agent. Até logo!');
        rl.close();
        process.exit(0);
      }

      if (trimmed === '/undo') {
        const undoRes = agent.undoLastAction();
        if (undoRes.undone) {
          console.log(`\x1b[32mÚltima ação revertida com sucesso: ${undoRes.actionType} em ${undoRes.restoredFile}\x1b[0m`);
        } else {
          console.log('\x1b[33mNenhuma ação no histórico para desfazer.\x1b[0m');
        }
        promptUser();
        return;
      }

      if (trimmed === '/files') {
        const files = sandbox.listFiles();
        console.log(`\x1b[34mArquivos na pasta isolada:\n${files.length ? files.join('\n') : '(pasta vazia)'}\x1b[0m`);
        promptUser();
        return;
      }

      if (trimmed === '/perms') {
        const perms = sandbox.getPermissionsManager().getSettings();
        console.log('\x1b[34mPermissões ativas:', JSON.stringify(perms, null, 2), '\x1b[0m');
        promptUser();
        return;
      }

      try {
        const reply = await agent.runPrompt(trimmed);
        console.log(`\n\x1b[32mAgent:\x1b[0m\n${reply}`);
      } catch (err: any) {
        console.log(`\x1b[31mErro: ${err.message}\x1b[0m`);
      }

      promptUser();
    });
  };

  promptUser();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCLI().catch(console.error);
}
