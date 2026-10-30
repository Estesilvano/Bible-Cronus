# 🤖 OpenCode Agent - Sandbox Isolado & CLI para Android (APK)

Aplicativo completo e seguro no estilo **Hermes Autonomous Agent**, projetado para executar no Android via APK nativo e linha de comando CLI, com isolamento rigoroso por contêiner de pasta única, sistema de desfazer alterações (Undo), monitoramento em tempo real e roteador inteligente de provedores LLM 100% gratuitos.

---

## 🌟 Principais Recursos

1. **🔒 Sandbox Isolado de Alta Segurança**:
   - Todo acesso a arquivos e tarefas de escrita é estritamente restrito à pasta segura do aplicativo (`/sandbox_workspace`).
   - Bloqueio ativo contra *path traversal* (ex: `../` ou acessos a arquivos confidenciais do sistema Android).

2. **↩️ Sistema de Desfazer (Undo)**:
   - Registro de snapshots a cada criação, edição ou exclusão de arquivo.
   - Restauração instantânea do conteúdo anterior através do botão "↩️ Desfazer" ou comando `/undo`.

3. **⏹️ Cancelamento em Tempo Real**:
   - Botão "⏹️ Cancelar" e interrupção graciosa via `AbortSignal`, permitindo parar qualquer geração ou execução em andamento.

4. **⚙️ Gerenciador de Permissões Granular**:
   - Controle total do usuário para ligar ou desligar permissões de leitura, escrita, busca na web e confirmação de exclusão.

5. **🌐 Roteador Automático de Modelos Gratuitos**:
   - Suporte nativo a provedores com modelos gratuitos:
     - **Groq**: Llama 3.3 70B Versatile, Llama 3.1 8B Instant (Ultra-rápido).
     - **OpenRouter**: Modelos `:free` (`meta-llama/llama-3.3-70b-instruct:free`, `mistralai/mistral-7b-instruct:free`).
     - **LMSYS Chatbot Arena**: Acesso aos modelos mais inteligentes do leaderboard.
     - **Puter.js Cloud AI Gateway**: Claude 3.5 Sonnet e GPT gratuitos via Puter.
     - **Hugging Face Inference API**: Modelos abertos.
     - **9router**: Hub de rota alternativa gratuita.
   - *Failover* automático: se um provedor falhar ou atingir limite de cota gratuita, o sistema alterna automaticamente para o próximo.

6. **📱 Pronto para Android APK & CLI**:
   - Interface moderna e amigável para leigos (Chat, Gerenciador de Arquivos do Sandbox, Monitor de Atividade em Tempo Real e Gerenciador de Chaves).
   - CLI completa para uso no terminal do desenvolvedor ou via Termux no celular.

---

## 🚀 Como Executar

### 1. Modo Web / Android Preview (Desenvolvimento)
```bash
npm install
npm start
# Acesse no navegador: http://localhost:3000
```

### 2. Modo Terminal CLI
```bash
npm run cli
```
Comandos CLI disponíveis:
- `/undo`: Desfaz a última ação em arquivo.
- `/files`: Lista os arquivos presentes no contêiner seguro.
- `/perms`: Exibe as permissões ativas.
- `/exit`: Sai da aplicação.

### 3. Gerar APK Android
```bash
# Executar script automatizado de empacotamento:
./build-apk.sh

# Ou via comandos do Capacitor:
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```
O arquivo APK gerado estará em: `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## 🧪 Testes Automatizados

Para rodar todos os testes unitários e de integração:
```bash
npm test
```
- Cobertura de isolamento de sandbox e prevenção de path traversal.
- Cobertura do sistema de Undo/Snapshots.
- Cobertura do Roteador de Provedores Gratuitos e Fallback com mocks.
- Cobertura do Hermes Agent e cancelamento de tarefas.
