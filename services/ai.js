/**
 * services/ai.js
 * Motor de Inteligência Artificial para o Termix
 * Suporte a múltiplos provedores: Google Gemini (nativo/padrão), OpenAI, Ollama (Local) e Anthropic
 */

// Heurísticas de detecção de comandos perigosos/destrutivos
const DANGEROUS_PATTERNS = [
  { regex: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|\s+--recursive|\s+--force)\s+([~/]|\*)/i, warning: 'Exclusão recursiva forçada de arquivos ou diretórios raiz/home.' },
  { regex: /\bmkfs\b/i, warning: 'Formatação de sistema de arquivos / partição de disco.' },
  { regex: /\bdd\s+if=/i, warning: 'Gravação direta de baixo nível em disco (dd).' },
  { regex: />\s*\/dev\/(sd[a-z]|nvme[0-9]|disk[0-9])/i, warning: 'Sobrescrita direta em dispositivo de bloco de disco.' },
  { regex: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, warning: 'Bomba de fork detectada (causa congelamento do sistema).' },
  { regex: /\bchmod\s+(-R\s+)?777\s+([~/]|\*)/i, warning: 'Permissão total (777) concedida recursivamente em diretório sensível.' },
  { regex: /\bkill\s+-9\s+-1\b/i, warning: 'Finalização forçada de todos os processos do usuário logado.' },
  { regex: /\b(shutdown|reboot|poweroff|init\s+0|init\s+6)\b/i, warning: 'Desligamento ou reinicialização do sistema operacional.' },
  { regex: /\bdrop\s+(database|table)\b/i, warning: 'Destruição de banco de dados ou tabela relacional.' }
];

/**
 * Mascara e higieniza segredos, senhas e chaves antes de enviar buffers para LLMs
 */
function redactSensitiveData(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    // Chaves privadas SSH/TLS/PGP
    .replace(/-----BEGIN [A-Z0-9 ]+ PRIVATE KEY-----[^-]+-----END [A-Z0-9 ]+ PRIVATE KEY-----/gs, '[REDACTED_PRIVATE_KEY]')
    .replace(/-----BEGIN CERTIFICATE-----[^-]+-----END CERTIFICATE-----/gs, '[REDACTED_CERTIFICATE]')
    // Tokens JWT
    .replace(/eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[REDACTED_JWT_TOKEN]')
    // AWS Access Key ID
    .replace(/\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]')
    // GitHub Tokens
    .replace(/\b(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,255}\b/g, '[REDACTED_GITHUB_TOKEN]')
    // Bearer / Authorization headers
    .replace(/Bearer\s+[a-zA-Z0-9_.\-~+/=]{16,}/gi, 'Bearer [REDACTED_TOKEN]')
    // Variáveis de ambiente com senhas / segredos
    .replace(/(password|passwd|secret|token|api_key|apikey|private_key)=([^\s;&|]+)/gi, '$1=[REDACTED]')
    // URLs com credenciais básicas (ex: http://user:pass@host)
    .replace(/:\/\/[^:\s]+:[^@\s]+@/g, '://[REDACTED_CREDENTIALS]@');
}

/**
 * Remove blocos de markdown ```json ... ``` se o modelo retornar com tags
 */
function extractJsonFromText(rawText) {
  if (!rawText) return null;
  let cleaned = rawText.trim();

  // Remove cercas de código ```json ... ```
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Tenta encontrar o primeiro objeto {...} no meio do texto
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch (_) {}
    }
    throw new Error(`Não foi possível decodificar JSON retornado pela IA: ${err.message}`);
  }
}

class AIService {
  constructor(dbManager) {
    this.db = dbManager;
  }

  /**
   * Obtém a configuração ativa com a chave de API descriptografada
   */
  getConfig() {
    return this.db.getAIConfig(true);
  }

  /**
   * Executa a chamada HTTP universal para o provedor selecionado
   */
  async callLLM({ systemPrompt, userPrompt, jsonMode = true, maxTokens = 1500 }) {
    const config = this.getConfig();
    const provider = config.provider || 'gemini';
    const apiKey = config.apiKey || '';
    const model = config.model || (provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini');

    // Validações prévias
    if (provider !== 'ollama' && !apiKey) {
      throw new Error(`A chave de API do provedor [${provider.toUpperCase()}] não foi configurada. Acesse Configurações de IA no Termix.`);
    }

    if (provider === 'gemini') {
      return this._callGemini({ apiKey, model, systemPrompt, userPrompt, jsonMode, maxTokens });
    } else if (provider === 'anthropic') {
      return this._callAnthropic({ apiKey, model, systemPrompt, userPrompt, jsonMode, maxTokens });
    } else {
      // OpenAI ou Ollama ou qualquer endpoint compatível
      const baseUrl = config.baseUrl || (provider === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1');
      return this._callOpenAICompatible({ baseUrl, apiKey, model, systemPrompt, userPrompt, jsonMode, maxTokens });
    }
  }

  /**
   * Integração com a API do Google Gemini
   */
  async _callGemini({ apiKey, model, systemPrompt, userPrompt, jsonMode, maxTokens }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const promptText = systemPrompt 
      ? `[Instruções do Sistema]:\n${systemPrompt}\n\n[Mensagem do Usuário]:\n${userPrompt}`
      : userPrompt;

    const bodyPayload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: promptText }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: maxTokens
      }
    };

    if (jsonMode) {
      bodyPayload.generationConfig.responseMimeType = 'application/json';
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload)
    });

    if (!res.ok) {
      let errDetails = '';
      try {
        const errJson = await res.json();
        errDetails = errJson.error ? errJson.error.message : JSON.stringify(errJson);
      } catch (_) {
        errDetails = await res.text();
      }
      throw new Error(`Erro na API do Google Gemini (${res.status}): ${errDetails}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Nenhuma resposta de texto retornada pelo Google Gemini.');
    }

    return text;
  }

  /**
   * Integração com endpoints compatíveis com a OpenAI (OpenAI, Ollama, LM Studio, Groq)
   */
  async _callOpenAICompatible({ baseUrl, apiKey, model, systemPrompt, userPrompt, jsonMode, maxTokens }) {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const url = `${cleanBaseUrl}/chat/completions`;

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const bodyPayload = {
      model: model || 'gpt-4o-mini',
      messages,
      temperature: 0.2,
      max_tokens: maxTokens
    };

    if (jsonMode) {
      bodyPayload.response_format = { type: 'json_object' };
    }

    const headers = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyPayload)
    });

    if (!res.ok) {
      let errDetails = '';
      try {
        const errJson = await res.json();
        errDetails = errJson.error ? errJson.error.message : JSON.stringify(errJson);
      } catch (_) {
        errDetails = await res.text();
      }
      throw new Error(`Erro na API compatível com OpenAI (${res.status}): ${errDetails}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('Nenhuma resposta de texto retornada pelo provedor OpenAI.');
    }

    return text;
  }

  /**
   * Integração com a API da Anthropic Claude
   */
  async _callAnthropic({ apiKey, model, systemPrompt, userPrompt, maxTokens }) {
    const url = 'https://api.anthropic.com/v1/messages';

    const bodyPayload = {
      model: model || 'claude-3-5-sonnet-20241022',
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [{ role: 'user', content: userPrompt }]
    };

    if (systemPrompt) {
      bodyPayload.system = systemPrompt;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(bodyPayload)
    });

    if (!res.ok) {
      let errDetails = '';
      try {
        const errJson = await res.json();
        errDetails = errJson.error ? errJson.error.message : JSON.stringify(errJson);
      } catch (_) {
        errDetails = await res.text();
      }
      throw new Error(`Erro na API da Anthropic (${res.status}): ${errDetails}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text;
    if (!text) {
      throw new Error('Nenhuma resposta de texto retornada pela Anthropic.');
    }

    return text;
  }

  /**
   * Testa a conectividade com o modelo configurado
   */
  async testConnection(testConfig = null) {
    let originalConfig = null;
    try {
      if (testConfig) {
        originalConfig = this.db.getAIConfig(true);
        this.db.saveAIConfig(testConfig);
      }

      const prompt = 'Responda com o JSON: {"status": "ok", "message": "Conexão com Termix estabelecida com sucesso"}';
      const raw = await this.callLLM({
        systemPrompt: 'Você é um assistente de validação de conectividade. Responda estritamente em JSON.',
        userPrompt: prompt,
        jsonMode: true,
        maxTokens: 100
      });

      const parsed = extractJsonFromText(raw);
      return {
        success: true,
        provider: this.getConfig().provider,
        model: this.getConfig().model,
        message: parsed?.message || 'Conexão validada com sucesso!'
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    } finally {
      if (originalConfig) {
        this.db.saveAIConfig(originalConfig);
      }
    }
  }

  /**
   * Feature 1: NL2CLI - Tradução de Linguagem Natural para Comando de Terminal
   */
  async generateCommand({ prompt, context = {} }) {
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw new Error('Prompt não fornecido para geração de comando.');
    }

    const config = this.getConfig();
    let sanitizedPrompt = prompt.trim();
    if (config.redactSecrets) {
      sanitizedPrompt = redactSensitiveData(sanitizedPrompt);
    }

    const systemPrompt = `Você é o Copilot de IA do Termix, um aplicativo multi-terminal avançado para macOS, Linux e servidores SSH.
O usuário descreverá em linguagem natural o que deseja fazer.
Você deve responder ESTRITAMENTE em formato JSON com a seguinte estrutura:
{
  "command": "string contendo o comando exato pronto para o shell (sem crases, sem prefixo $)",
  "explanation": "explicação concisa em português do que o comando faz e suas flags principais",
  "isDangerous": true/false (true se puder apagar arquivos, matar processos vitais, reiniciar máquina ou sobrescrever dados),
  "riskWarning": "aviso claro do risco se for perigoso, ou null se for seguro"
}
Regras:
1. Priorize ferramentas seguras e modernas do ambiente alvo (macOS / Linux).
2. Se o contexto indicar zsh/bash, use sintaxe compatível.
3. Não invente flags inexistentes.
4. NUNCA envolva o JSON com explicações externas.`;

    const userPrompt = `Contexto do Terminal:
- Sistema Operacional: ${context.platform || process.platform}
- Shell: ${context.shell || 'zsh'}
- Host: ${context.hostName || 'Local'} (${context.isSSH ? 'SSH Remoto' : 'Máquina Local'})
- Diretório Atual (CWD): ${context.cwd || '~'}
- Buffer recente (últimas linhas):
${config.redactSecrets ? redactSensitiveData(context.recentOutput || '') : (context.recentOutput || 'Nenhum')}

Pedido do Usuário:
"${sanitizedPrompt}"`;

    const rawResult = await this.callLLM({
      systemPrompt,
      userPrompt,
      jsonMode: true,
      maxTokens: 800
    });

    const parsed = extractJsonFromText(rawResult);

    // Verificação heurística de segurança independente da resposta do LLM
    let isDangerous = Boolean(parsed.isDangerous);
    let riskWarning = parsed.riskWarning || null;

    if (parsed.command) {
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.regex.test(parsed.command)) {
          isDangerous = true;
          riskWarning = riskWarning ? `${riskWarning} | ${pattern.warning}` : pattern.warning;
          break;
        }
      }
    }

    return {
      command: (parsed.command || '').trim(),
      explanation: parsed.explanation || '',
      isDangerous,
      riskWarning
    };
  }

  /**
   * Feature 2: Diagnóstico e Auto-Fix de Erros no Terminal
   */
  async diagnoseError({ command = '', errorText = '', exitCode = null, context = {} }) {
    const config = this.getConfig();
    let sanitizedError = errorText || '';
    if (config.redactSecrets) {
      sanitizedError = redactSensitiveData(sanitizedError);
    }

    const systemPrompt = `Você é um engenheiro sênior DevOps de troubleshooting integrado ao Termix.
Um comando falhou no terminal do usuário. Analise a saída do erro, o código de saída e o comando executado.
Você deve responder ESTRITAMENTE em formato JSON com a seguinte estrutura:
{
  "diagnosis": "resumo objetivo em 1 ou 2 frases em português explicando exatamente porque a falha ocorreu",
  "rootCause": "categoria do erro (ex: 'Porta em Uso', 'Permissão Negada', 'Dependência Ausente', 'Erro de Sintaxe', 'Timeout')",
  "fixCommand": "comando de correção pronto para ser executado no terminal, ou null se não houver um comando único de fix",
  "explanation": "explicação de como a correção resolve o problema",
  "preventiveTip": "dica opcional para evitar o erro no futuro"
}`;

    const userPrompt = `Comando Executado: ${command || 'Desconhecido'}
Código de Saída (Exit Code): ${exitCode !== null ? exitCode : 'Não nulo'}
Ambiente: ${context.platform || process.platform} (${context.isSSH ? 'Servidor Remoto SSH' : 'Local'})
Diretório: ${context.cwd || '~'}

Saída do Erro / Buffer:
${sanitizedError.slice(-3000)}`;

    const rawResult = await this.callLLM({
      systemPrompt,
      userPrompt,
      jsonMode: true,
      maxTokens: 1000
    });

    const parsed = extractJsonFromText(rawResult);

    let isFixDangerous = false;
    if (parsed.fixCommand) {
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.regex.test(parsed.fixCommand)) {
          isFixDangerous = true;
          break;
        }
      }
    }

    return {
      diagnosis: parsed.diagnosis || 'Falha na execução do processo.',
      rootCause: parsed.rootCause || 'Erro de Execução',
      fixCommand: parsed.fixCommand ? parsed.fixCommand.trim() : null,
      explanation: parsed.explanation || '',
      preventiveTip: parsed.preventiveTip || '',
      isFixDangerous
    };
  }

  /**
   * Feature 3: Explicação de Comandos
   */
  async explainCommand({ command }) {
    if (!command || !command.trim()) {
      throw new Error('Comando vazio.');
    }

    const systemPrompt = `Você é um instrutor Unix/DevOps. Explique o comando fornecido em detalhes e em bom português.
Responda ESTRITAMENTE em formato JSON:
{
  "summary": "resumo geral do que o comando faz em 1 frase",
  "breakdown": [
    { "part": "ex: find", "purpose": "utilitário de busca de arquivos" },
    { "part": "ex: -mtime -2", "purpose": "filtra arquivos modificados nas últimas 48 horas" }
  ],
  "safetyLevel": "safe" | "caution" | "dangerous",
  "notes": "observações úteis ou cuidados"
}`;

    const rawResult = await this.callLLM({
      systemPrompt,
      userPrompt: `Explique este comando:\n${command.trim()}`,
      jsonMode: true,
      maxTokens: 800
    });

    return extractJsonFromText(rawResult);
  }

  /**
   * Feature 4: Sumarização Inteligente de Broadcast Multi-Terminal
   */
  async summarizeBroadcast({ broadcastCommand, outputs = [] }) {
    const config = this.getConfig();

    const sanitizedOutputs = outputs.map(item => ({
      title: item.title,
      host: item.host || 'Local',
      exitCode: item.exitCode,
      snippet: config.redactSecrets ? redactSensitiveData(item.output || '').slice(-1500) : (item.output || '').slice(-1500)
    }));

    const systemPrompt = `Você é um orquestrador de operações de infraestrutura e DevOps integrado ao Termix.
O usuário executou um comando via Broadcast simultâneo em múltiplos terminais/servidores.
Analise a resposta de cada terminal e compare os resultados.
Responda ESTRITAMENTE em formato JSON com a seguinte estrutura:
{
  "summary": "resumo executivo do resultado geral do broadcast (ex: 'Todos os 5 hosts completaram a tarefa com sucesso' ou '4 de 5 hosts responderam OK, 1 falhou')",
  "totalHosts": número,
  "successfulHosts": número,
  "failedHosts": número,
  "anomalies": [
    { "host": "nome do host", "issue": "descrição da discrepância ou do erro encontrado" }
  ],
  "actionRecommended": "próxima ação recomendada se houver falhas, ou null"
}`;

    const userPrompt = `Comando Transmitido em Broadcast:
"${broadcastCommand}"

Respostas dos Terminais (${sanitizedOutputs.length}):
${JSON.stringify(sanitizedOutputs, null, 2)}`;

    const rawResult = await this.callLLM({
      systemPrompt,
      userPrompt,
      jsonMode: true,
      maxTokens: 1200
    });

    return extractJsonFromText(rawResult);
  }
}

module.exports = AIService;
