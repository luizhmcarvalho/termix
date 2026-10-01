/**
 * services/ai.js
 * Motor de Inteligência Artificial para o Termix
 * Suporte a múltiplos provedores: Google Gemini (nativo/padrão), OpenAI, Anthropic, DeepSeek, NVIDIA NIM, AWS Bedrock e Ollama (Local)
 */

const crypto = require('crypto');

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
 * Assinatura AWS Signature Version 4 (SigV4) para chamadas REST ao AWS Bedrock
 */
function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function signAwsSigV4({ method, url, region, service, headers, body, accessKeyId, secretAccessKey, sessionToken }) {
  const parsedUrl = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  const finalHeaders = {
    ...headers,
    'host': parsedUrl.host,
    'x-amz-date': amzDate
  };

  if (sessionToken) {
    finalHeaders['x-amz-security-token'] = sessionToken;
  }

  const sortedHeaderKeys = Object.keys(finalHeaders).map(k => k.toLowerCase()).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map(k => `${k}:${finalHeaders[k].trim()}\n`)
    .join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const payloadHash = sha256Hex(body || '');

  const canonicalRequest = [
    method.toUpperCase(),
    parsedUrl.pathname,
    parsedUrl.search.replace(/^\?/, ''),
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n');

  const kDate = hmacSha256('AWS4' + secretAccessKey, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  finalHeaders['Authorization'] = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return finalHeaders;
}

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
    // NVIDIA NIM API Key (nvapi-...)
    .replace(/\bnvapi-[a-zA-Z0-9_\-]{30,}\b/g, '[REDACTED_NVIDIA_KEY]')
    // Anthropic API Key (sk-ant-...)
    .replace(/\bsk-ant-[a-zA-Z0-9_\-]{30,}\b/g, '[REDACTED_ANTHROPIC_KEY]')
    // OpenAI / DeepSeek API Keys (sk-...)
    .replace(/\bsk-[a-zA-Z0-9_\-]{30,}\b/g, '[REDACTED_API_KEY]')
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
 * Retorna instrução de diretriz de idioma para os prompts de sistema da IA
 */
function getLanguageInstruction(lang) {
  if (lang === 'en') {
    return 'Language rule: Provide all explanations, diagnoses, and descriptions strictly in English.';
  }
  if (lang === 'es') {
    return 'Regla de idioma: Proporcione todas las explicaciones, diagnósticos y descripciones estrictamente en español.';
  }
  return 'Regra de idioma: Forneça todas as explicações, diagnósticos e descrições estritamente em português do Brasil.';
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
    const model = config.model;
    const region = config.region || 'us-east-1';

    // Validações prévias
    if (provider !== 'ollama' && !apiKey) {
      throw new Error(`A chave de API do provedor [${provider.toUpperCase()}] não foi configurada. Acesse Configurações de IA no Termix.`);
    }

    if (provider === 'gemini') {
      return this._callGemini({ apiKey, model: model || 'gemini-2.5-flash', systemPrompt, userPrompt, jsonMode, maxTokens });
    } else if (provider === 'anthropic') {
      return this._callAnthropic({ apiKey, model: model || 'claude-3-5-sonnet-20241022', systemPrompt, userPrompt, jsonMode, maxTokens });
    } else if (provider === 'bedrock') {
      return this._callBedrock({ apiKey, model: model || 'anthropic.claude-3-5-sonnet-20241022-v2:0', region, systemPrompt, userPrompt, maxTokens });
    } else if (provider === 'deepseek') {
      const baseUrl = config.baseUrl || 'https://api.deepseek.com';
      return this._callOpenAICompatible({ baseUrl, apiKey, model: model || 'deepseek-chat', systemPrompt, userPrompt, jsonMode, maxTokens });
    } else if (provider === 'nvidia') {
      const baseUrl = config.baseUrl || 'https://integrate.api.nvidia.com/v1';
      return this._callOpenAICompatible({ baseUrl, apiKey, model: model || 'meta/llama-3.3-70b-instruct', systemPrompt, userPrompt, jsonMode, maxTokens });
    } else {
      // openai, ollama ou custom
      let defaultBaseUrl = 'https://api.openai.com/v1';
      let defaultModel = 'gpt-4o-mini';
      if (provider === 'ollama') {
        defaultBaseUrl = 'http://localhost:11434/v1';
        defaultModel = 'llama3.2';
      }
      const baseUrl = config.baseUrl || defaultBaseUrl;
      return this._callOpenAICompatible({ baseUrl, apiKey, model: model || defaultModel, systemPrompt, userPrompt, jsonMode, maxTokens });
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
   * Integração com endpoints compatíveis com a OpenAI (OpenAI, DeepSeek, NVIDIA, Ollama, LM Studio, etc.)
   */
  async _callOpenAICompatible({ baseUrl, apiKey, model, systemPrompt, userPrompt, jsonMode, maxTokens }) {
    const cleanBaseUrl = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const url = `${cleanBaseUrl}/chat/completions`;

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    // Modelos de raciocínio (ex: deepseek-reasoner / R1) têm parâmetros estritos
    const isReasoner = (model || '').toLowerCase().includes('reasoner') || (model || '').toLowerCase().includes('deepseek-r1');

    const bodyPayload = {
      model: model || 'gpt-4o-mini',
      messages,
      max_tokens: maxTokens
    };

    if (!isReasoner) {
      bodyPayload.temperature = 0.2;
    }

    if (jsonMode && !isReasoner) {
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
        errDetails = errJson.error ? (errJson.error.message || JSON.stringify(errJson.error)) : JSON.stringify(errJson);
      } catch (_) {
        errDetails = await res.text();
      }
      throw new Error(`Erro na API (${res.status}): ${errDetails}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('Nenhuma resposta de texto retornada pelo provedor de IA.');
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
        errDetails = errJson.error ? (errJson.error.message || JSON.stringify(errJson.error)) : JSON.stringify(errJson);
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
   * Integração com o AWS Bedrock (Converse API)
   * Suporta autenticação via:
   * 1. Bedrock API Key / Bearer token (Authorization: Bearer <key>)
   * 2. AWS SigV4 Credentials (formato "ACCESS_KEY_ID:SECRET_KEY" ou "ACCESS_KEY_ID:SECRET_KEY:SESSION_TOKEN" ou env vars)
   */
  async _callBedrock({ apiKey, model, region = 'us-east-1', systemPrompt, userPrompt, maxTokens }) {
    const targetRegion = region || 'us-east-1';
    const targetModel = model || 'anthropic.claude-3-5-sonnet-20241022-v2:0';
    const url = `https://bedrock-runtime.${targetRegion}.amazonaws.com/model/${encodeURIComponent(targetModel)}/converse`;

    const bodyPayload = {
      messages: [
        {
          role: 'user',
          content: [{ text: userPrompt }]
        }
      ],
      inferenceConfig: {
        maxTokens: maxTokens || 1000,
        temperature: 0.2
      }
    };

    if (systemPrompt) {
      bodyPayload.system = [{ text: systemPrompt }];
    }

    const bodyStr = JSON.stringify(bodyPayload);
    let headers = {
      'Content-Type': 'application/json'
    };

    const trimmedKey = (apiKey || '').trim();
    if (trimmedKey.includes(':')) {
      const parts = trimmedKey.split(':');
      const accessKeyId = parts[0].trim();
      const secretAccessKey = parts[1].trim();
      const sessionToken = parts[2] ? parts[2].trim() : null;

      headers = signAwsSigV4({
        method: 'POST',
        url,
        region: targetRegion,
        service: 'bedrock',
        headers,
        body: bodyStr,
        accessKeyId,
        secretAccessKey,
        sessionToken
      });
    } else if (trimmedKey.startsWith('AKIA') || trimmedKey.startsWith('ASIA')) {
      const accessKeyId = trimmedKey;
      const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
      headers = signAwsSigV4({
        method: 'POST',
        url,
        region: targetRegion,
        service: 'bedrock',
        headers,
        body: bodyStr,
        accessKeyId,
        secretAccessKey,
        sessionToken: process.env.AWS_SESSION_TOKEN || null
      });
    } else {
      // Bedrock API Key / Bearer token
      headers['Authorization'] = `Bearer ${trimmedKey}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: bodyStr
    });

    if (!res.ok) {
      let errDetails = '';
      try {
        const errJson = await res.json();
        errDetails = errJson.message || errJson.Message || JSON.stringify(errJson);
      } catch (_) {
        errDetails = await res.text();
      }
      throw new Error(`Erro na API do AWS Bedrock (${res.status}): ${errDetails}`);
    }

    const data = await res.json();
    const text = data.output?.message?.content?.[0]?.text;
    if (!text) {
      throw new Error('Nenhuma resposta de texto retornada pelo AWS Bedrock.');
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
        let testKey = testConfig.apiKey;
        // Se a chave não foi redigitada no teste, usa a chave salva daquele provedor
        if (!testKey || testKey.includes('••••') || testKey.includes('...')) {
          const providerKeys = originalConfig.keys_decrypted || {};
          testKey = providerKeys[testConfig.provider] || (originalConfig.provider === testConfig.provider ? originalConfig.apiKey : '');
        }

        this.db.saveAIConfig({
          ...testConfig,
          apiKey: testKey
        });
      }

      const prompt = 'Responda com o JSON: {"status": "ok", "message": "Conexão com Termix estabelecida com sucesso"}';
      const raw = await this.callLLM({
        systemPrompt: 'Você é um assistente de validação de conectividade do Termix. Responda estritamente em JSON.',
        userPrompt: prompt,
        jsonMode: true,
        maxTokens: 100
      });

      const parsed = extractJsonFromText(raw);
      const activeConf = this.getConfig();
      return {
        success: true,
        provider: activeConf.provider,
        model: activeConf.model,
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
    const lang = context.language || this.db?.getSetting('app_language') || 'pt';
    let sanitizedPrompt = prompt.trim();
    if (config.redactSecrets) {
      sanitizedPrompt = redactSensitiveData(sanitizedPrompt);
    }

    const systemPrompt = `Você é o Copilot de IA do Termix, um aplicativo multi-terminal avançado para macOS, Linux e servidores SSH.
O usuário descreverá em linguagem natural o que deseja fazer.
${getLanguageInstruction(lang)}
Você deve responder ESTRITAMENTE em formato JSON com a seguinte estrutura:
{
  "command": "string contendo o comando exato pronto para o shell (sem crases, sem prefixo $)",
  "explanation": "explicação concisa do que o comando faz e suas flags principais no idioma solicitado",
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
    const lang = context.language || this.db?.getSetting('app_language') || 'pt';
    let sanitizedError = errorText || '';
    if (config.redactSecrets) {
      sanitizedError = redactSensitiveData(sanitizedError);
    }

    const systemPrompt = `Você é um engenheiro sênior DevOps de troubleshooting integrado ao Termix.
Um comando falhou no terminal do usuário. Analise a saída do erro, o código de saída e o comando executado.
${getLanguageInstruction(lang)}
Você deve responder ESTRITAMENTE em formato JSON com a seguinte estrutura:
{
  "diagnosis": "resumo objetivo em 1 ou 2 frases explicando exatamente porque a falha ocorreu",
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
  async explainCommand({ command, context = {} }) {
    if (!command || !command.trim()) {
      throw new Error('Comando vazio.');
    }

    const lang = context.language || this.db?.getSetting('app_language') || 'pt';
    const systemPrompt = `Você é um instrutor Unix/DevOps. Explique o comando fornecido em detalhes.
${getLanguageInstruction(lang)}
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
  async summarizeBroadcast({ broadcastCommand, outputs = [], context = {} }) {
    const config = this.getConfig();
    const lang = context.language || this.db?.getSetting('app_language') || 'pt';

    const sanitizedOutputs = outputs.map(item => ({
      title: item.title,
      host: item.host || 'Local',
      exitCode: item.exitCode,
      snippet: config.redactSecrets ? redactSensitiveData(item.output || '').slice(-1500) : (item.output || '').slice(-1500)
    }));

    const systemPrompt = `Você é um orquestrador de operações de infraestrutura e DevOps integrado ao Termix.
O usuário executou um comando via Broadcast simultâneo em múltiplos terminais/servidores.
Analise a resposta de cada terminal e compare os resultados.
${getLanguageInstruction(lang)}
Responda ESTRITAMENTE em formato JSON com a seguinte estrutura:
{
  "summary": "resumo executivo do resultado geral do broadcast",
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

  getLanguageInstruction(lang) {
    return getLanguageInstruction(lang);
  }

  static getLanguageInstruction(lang) {
    return getLanguageInstruction(lang);
  }
}

module.exports = AIService;
