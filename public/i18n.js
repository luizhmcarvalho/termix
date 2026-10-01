/**
 * public/i18n.js
 * Sistema Internacional de Idiomas para o Termix
 * Suporte completo a Português (pt), Inglês (en) e Espanhol (es)
 */

const TERMIX_LANGUAGES = {
  pt: {
    name: 'Português',
    nativeName: 'Português (Brasil)',
    flag: '🇧🇷',
    code: 'pt'
  },
  en: {
    name: 'English',
    nativeName: 'English (US)',
    flag: '🇺🇸',
    code: 'en'
  },
  es: {
    name: 'Español',
    nativeName: 'Español',
    flag: '🇪🇸',
    code: 'es'
  }
};

const TERMIX_TRANSLATIONS = {
  pt: {
    // Topbar & Brand
    app_title: 'Termix • Multi-Terminal Dashboard',
    app_desc: 'Dashboard centralizado para gerenciamento simultâneo de múltiplos terminais com Node.js, WebSockets e xterm.js',
    brand_connecting: 'Conectando...',
    brand_connected: 'Conectado',
    brand_disconnected: 'Desconectado',
    brand_pty: 'PTY',

    // Layout
    layout_title: 'Selecionar Layout da Grade',
    layout_header: 'Layout da Grade',
    layout_auto: 'Mosaico Auto',
    layout_1col: '1 Coluna (Foco)',
    layout_2col: '2 Colunas',
    layout_3col: '3 Colunas',

    // Topbar Buttons
    btn_workspaces_title: 'Workspaces Salvos (Alt + W ou ⌘ + ⇧ + W)',
    btn_hosts_title: 'Gerenciador de Hosts e Identidades (Alt + H ou ⌘ + ⇧ + H)',
    btn_broadcast_title: 'Transmitir para Todos os Terminais (Alt + B ou ⌘ + B)',
    btn_ai_title: 'Assistente de IA / Copilot (⌘ + I ou Alt + I)',
    btn_ai_settings_title: 'Configurações de IA & Preferências',
    btn_backup_title: 'Exportar e Importar Configurações e Credenciais (Alt + E)',
    btn_new_terminal_title: 'Novo Terminal (Alt + T ou ⌘ + T)',
    btn_theme_toggle_title: 'Alternar Tema Claro / Escuro (Alt + J)',
    btn_language_title: 'Alterar Idioma / Change Language',
    btn_help_title: 'Atalhos de teclado e ajuda',

    // Broadcast Bar
    broadcast_label: 'TRANSMITIR PARA TODOS',
    broadcast_placeholder: 'Digite o comando e pressione Enter (ex: ls -la, git status)...',
    broadcast_send: 'Enviar ↵',
    broadcast_ai_summary: 'Resumir saídas de todos os terminais com IA',
    broadcast_no_terminals: 'Nenhum terminal ativo para transmitir.',

    // Empty State
    empty_title: 'Nenhum terminal ativo no momento',
    empty_desc: 'Abra sessões de linha de comando locais, conecte-se a servidores remotos via SSH ou restaure workspaces salvos.',
    empty_btn_new: 'Novo Terminal',
    empty_btn_workspaces: 'Workspaces',
    empty_btn_hosts: 'Hosts & SSH',

    // Terminal Card
    term_focus_title: 'Foco no terminal',
    term_maximize_title: 'Maximizar terminal',
    term_restore_title: 'Restaurar grade',
    term_rename_title: 'Renomear título',
    term_clear_title: 'Limpar saída (Ctrl + L)',
    term_copy_title: 'Copiar todo o conteúdo do buffer',
    term_duplicate_title: 'Duplicar este terminal',
    term_reconnect_title: 'Reconectar processo',
    term_close_title: 'Fechar este terminal',
    term_status_active: 'Ativo',
    term_status_connecting: 'Conectando...',
    term_status_exited: 'Finalizado',
    term_rename_prompt: 'Digite o novo título do terminal:',
    term_confirm_close: 'Deseja realmente fechar este terminal?',
    term_copied_success: 'Conteúdo do terminal copiado!',

    // Footer
    footer_terms_zero: 'Nenhum terminal ativo',
    footer_terms_one: '1 terminal ativo',
    footer_terms_multi: '{n} terminais ativos',
    footer_connected: 'Conectado ao Backend PTY',
    footer_disconnected: 'Desconectado do Servidor',

    // Help Modal
    help_modal_title: 'Sobre o Termix',
    help_modal_desc: 'Dashboard desktop profissional para gerenciamento simultâneo de múltiplos pseudoterminais locais e SSH remotos.',
    help_shortcuts_title: 'Atalhos de Teclado',
    help_shortcut_new: 'Novo terminal local',
    help_shortcut_broadcast: 'Alternar barra de Broadcast',
    help_shortcut_copilot: 'Assistente de IA Copilot',
    help_shortcut_hosts: 'Abrir Gerenciador de Hosts',
    help_shortcut_workspaces: 'Abrir Workspaces Salvos',
    help_shortcut_backup: 'Exportar / Importar Configurações',
    help_shortcut_theme: 'Alternar tema claro/escuro',
    help_shortcut_clear: 'Limpar terminal ativo',
    help_shortcut_close: 'Fechar terminal ativo',

    // Hosts & Identities Modal
    hosts_modal_title: 'Gerenciador de Conexões',
    hosts_modal_subtitle: 'Servidores remotos SSH, terminais locais e chaves protegidas',
    hosts_tab_hosts: 'Hosts & Conexões',
    hosts_tab_identities: 'Identidades & Chaves',
    hosts_search_placeholder: 'Buscar hosts por nome, host, tag...',
    hosts_filter_all: 'Todos os Tipos',
    hosts_filter_ssh: 'Somente SSH',
    hosts_filter_local: 'Somente Local',
    hosts_group_tag: 'Agrupar por Tag',
    hosts_group_none: 'Sem Agrupamento',
    hosts_btn_new_host: '+ Novo Host',
    hosts_btn_new_identity: '+ Nova Identidade',
    hosts_btn_backup: 'Exportar / Importar',
    hosts_empty_title: 'Nenhum host cadastrado ainda',
    hosts_empty_desc: 'Adicione seus servidores SSH ou diretórios locais favoritos para conexão rápida com 1 clique.',
    hosts_identities_empty_title: 'Nenhuma identidade cadastrada ainda',
    hosts_identities_empty_desc: 'Cadastre identidades com senhas criptografadas, chaves SSH privadas ou certificados PEM para reutilizar em seus hosts.',
    host_action_connect: 'Conectar',
    host_action_edit: 'Editar',
    host_action_duplicate: 'Duplicar',
    host_action_delete: 'Excluir',
    host_confirm_delete: 'Tem certeza que deseja excluir o host "{name}"?',
    identity_confirm_delete: 'Tem certeza que deseja excluir a identidade "{name}"?',

    // Host Form
    host_form_new_title: 'Novo Host',
    host_form_edit_title: 'Editar Host',
    host_form_subtitle: 'Cadastre servidores SSH ou atalhos para terminais locais',
    host_label_name: 'Nome do Host *',
    host_placeholder_name: 'Ex: VPS Produção, API Staging, Servidor Web',
    host_label_type: 'Tipo de Conexão *',
    host_type_ssh: 'SSH Remoto',
    host_type_local: 'Terminal Local',
    host_label_color: 'Cor / Tag Visual',
    host_label_hostname: 'Endereço / Hostname *',
    host_placeholder_hostname: 'Ex: 192.168.1.100 ou vps.empresa.com',
    host_label_port: 'Porta SSH *',
    host_label_identity: 'Identidade (Credenciais SSH)',
    host_identity_none: 'Nenhuma (Digitar senha interativamente)',
    host_link_create_identity: '+ Criar Nova Identidade',
    host_label_path: 'Diretório Inicial (CWD)',
    host_placeholder_path: 'Ex: /var/www/app ou ~/projetos',
    host_label_command: 'Comando Automático ao Conectar',
    host_placeholder_command: 'Ex: htop, docker ps, tail -f logs.txt',
    host_label_tags: 'Tags (separadas por vírgula)',
    host_placeholder_tags: 'Ex: producao, aws, web, database',
    host_save_success: 'Host salvo com sucesso!',
    host_save_error: 'Erro ao salvar host: ',

    // Identity Form
    identity_form_new_title: 'Nova Identidade',
    identity_form_edit_title: 'Editar Identidade',
    identity_form_subtitle: 'Credenciais criptografadas localmente com AES-256-GCM',
    identity_label_name: 'Nome da Identidade *',
    identity_placeholder_name: 'Ex: Root Produção, Deploy Bot, Chave AWS',
    identity_label_username: 'Usuário SSH (Username) *',
    identity_placeholder_username: 'Ex: root, ubuntu, debian, ec2-user',
    identity_label_auth_type: 'Tipo de Autenticação *',
    identity_auth_password: 'Senha (Password)',
    identity_auth_key: 'Chave Privada (Arquivo)',
    identity_auth_passphrase: 'Chave + Frase Secreta (Passphrase)',
    identity_auth_cert: 'Certificado / Chave PEM (Conteúdo)',
    identity_label_password: 'Senha de Acesso',
    identity_placeholder_password: 'Digite a senha do usuário SSH',
    identity_label_key_path: 'Caminho do Arquivo de Chave Privada',
    identity_placeholder_key_path: 'Ex: ~/.ssh/id_rsa ou /Users/nome/.ssh/id_ed25519',
    identity_label_passphrase: 'Frase Secreta da Chave (Passphrase)',
    identity_placeholder_passphrase: 'Frase de desbloqueio da chave privada (se houver)',
    identity_label_certificate: 'Conteúdo da Chave / Certificado PEM',
    identity_placeholder_certificate: 'Cole aqui o conteúdo completo da chave PEM / OpenSSH...',
    identity_save_success: 'Identidade salva com sucesso!',
    identity_save_error: 'Erro ao salvar identidade: ',

    // Workspaces
    ws_modal_title: 'Workspaces Salvos',
    ws_modal_subtitle: 'Abra conjuntos inteiros de terminais com um único clique',
    ws_btn_save_current: 'Salvar Sessão Atual como Workspace',
    ws_btn_new: '+ Novo Workspace',
    ws_empty_title: 'Nenhum workspace salvo ainda',
    ws_empty_desc: 'Crie seu primeiro workspace para abrir vários terminais simultâneos com um clique.',
    ws_action_open: 'Abrir Workspace',
    ws_action_edit: 'Editar',
    ws_action_delete: 'Excluir',
    ws_terminals_count: '{n} terminais',
    ws_form_new_title: 'Novo Workspace',
    ws_form_edit_title: 'Editar Workspace',
    ws_form_subtitle: 'Configure múltiplos terminais que serão inicializados juntos',
    ws_label_name: 'Nome do Workspace *',
    ws_placeholder_name: 'Ex: Ambiente Backend, Microsserviços, Monitoramento',
    ws_label_layout: 'Layout Padrão',
    ws_label_color: 'Cor do Workspace',
    ws_label_desc: 'Descrição (Opcional)',
    ws_placeholder_desc: 'Ex: 2 terminais backend, 1 frontend e monitoramento de logs',
    ws_label_terminals: 'Terminais incluídos neste workspace',
    ws_btn_add_term: '+ Adicionar Terminal',
    ws_term_title_label: 'Título',
    ws_term_host_label: 'Host / Conexão',
    ws_term_host_local: 'Terminal Local Padrão',
    ws_term_path_label: 'Diretório',
    ws_term_command_label: 'Comando Inicial',
    ws_save_success: 'Workspace salvo com sucesso!',
    ws_save_error: 'Erro ao salvar workspace: ',
    ws_confirm_delete: 'Tem certeza que deseja excluir o workspace "{name}"?',
    ws_need_one_terminal: 'Adicione ao menos um terminal ao workspace.',
    ws_open_session_first: 'Abra ao menos um terminal antes de salvar a sessão como workspace.',

    // AI Copilot
    ai_copilot_title: 'Termix Copilot',
    ai_copilot_subtitle: 'Gere comandos em linguagem natural e envie ao terminal ativo',
    ai_copilot_placeholder: 'Ex: Encontrar todos os arquivos .log maiores que 100MB e compactar em tar.gz...',
    ai_copilot_btn_generate: 'Gerar Comando ↵',
    ai_copilot_generating: 'Gerando comando com IA...',
    ai_copilot_btn_send: 'Enviar ao Terminal',
    ai_copilot_btn_copy: 'Copiar',
    ai_copilot_btn_explain: 'Explicar Detalhes',
    ai_copilot_danger_warning: 'Atenção: Este comando pode alterar ou excluir dados do sistema.',
    ai_copilot_sent_success: 'Comando enviado ao terminal!',

    // AI Diagnosis
    ai_diag_title: 'Diagnóstico Inteligente de Erro',
    ai_diag_subtitle: 'Análise automática da saída do terminal com sugestão de correção',
    ai_diag_analyzing: 'Analisando saída com engenheiro de suporte de IA...',
    ai_diag_root_cause: 'Causa Provável',
    ai_diag_explanation: 'Explicação Técnica',
    ai_diag_suggested_command: 'Comando de Correção Sugerido',
    ai_diag_preventive: 'Dica Preventiva',
    ai_diag_btn_apply: 'Executar Correção no Terminal',

    // AI Broadcast Summary
    ai_broadcast_title: 'Resumo de Broadcast Multi-Terminal',
    ai_broadcast_subtitle: 'Síntese automatizada de respostas de todas as instâncias ativas',
    ai_broadcast_analyzing: 'Analisando saídas de todos os terminais...',
    ai_broadcast_terminals_total: 'Terminais Analisados',
    ai_broadcast_responses_ok: 'Respostas OK',
    ai_broadcast_failures: 'Com Falhas / Anomalias',
    ai_broadcast_overview: 'Visão Geral',
    ai_broadcast_discrepancies: 'Discrepâncias Encontradas',
    ai_broadcast_recommendation: 'Ação Recomendada:',

    // AI Settings & Preferences
    ai_settings_title: 'Configurações de IA & Preferências',
    ai_settings_subtitle: 'Personalize provedores, chaves criptografadas, modelo e idioma',
    ai_label_language: 'Idioma da Interface (Language)',
    ai_label_provider: 'Provedor de IA *',
    ai_label_model: 'Modelo *',
    ai_model_help: 'Digite qualquer modelo ou selecione uma sugestão',
    ai_label_region: 'Região AWS Bedrock *',
    ai_region_hint: 'Região onde os modelos do Bedrock estão habilitados na sua conta AWS.',
    ai_label_apikey: 'Chave de API (API Key)',
    ai_key_help: 'Armazenada localmente com criptografia AES-256-GCM',
    ai_key_placeholder: 'Cole sua chave aqui (armazenamento criptografado)...',
    ai_label_baseurl: 'Endpoint / URL Base (Opcional ou Local)',
    ai_baseurl_hint: 'Padrão para Ollama local: http://localhost:11434/v1',
    ai_label_redact: 'Mascara senhas, tokens Bearer e chaves privadas antes do envio (Redaction)',
    ai_label_auto_suggest: 'Sugerir correção automaticamente em caso de código de saída com erro',
    ai_key_none: 'Nenhuma chave configurada para este provedor.',
    ai_key_configured: 'Chave configurada com segurança: ',
    ai_btn_clear_key: 'Remover Chave',
    ai_btn_test: 'Testar Conexão',
    ai_btn_save: 'Salvar Configurações',
    ai_test_testing: 'Testando conexão...',
    ai_test_success: 'Conexão testada com sucesso! Resposta da IA recebida.',
    ai_test_error: 'Falha no teste de conexão: ',
    ai_save_success: 'Configurações salvas com sucesso!',

    // Export & Import (Backup) Modal
    backup_modal_title: 'Exportar e Importar Configurações',
    backup_modal_subtitle: 'Backup completo e migração segura de hosts, identidades, credenciais e workspaces',
    backup_tab_export: 'Exportar Dados (Backup)',
    backup_tab_import: 'Importar Dados (Restaurar)',
    export_section_items: '1. Selecione os itens para incluir no backup:',
    export_item_hosts: 'Hosts e Conexões SSH ({n} cadastrados)',
    export_item_identities: 'Identidades e Credenciais ({n} cadastradas)',
    export_item_workspaces: 'Workspaces Salvos ({n} cadastrados)',
    export_item_settings: 'Configurações de IA, Provedores, Idioma e Tema',
    export_section_security: '2. Proteção e Segurança do Arquivo:',
    export_mode_encrypted: 'Proteger com Senha (Criptografia AES-256-GCM - Recomendado)',
    export_mode_encrypted_desc: 'O arquivo será criptografado com chave de 256 bits derivada da sua senha via PBKDF2 (100.000 iterações). Seguro para armazenar ou transportar.',
    export_mode_plain: 'Exportar sem Senha (Arquivo Aberto)',
    export_mode_plain_with_creds: 'Incluir senhas e chaves descriptografadas (Aviso: conterá segredos em texto puro)',
    export_mode_plain_no_creds: 'Omitir credenciais sensíveis (Exportar apenas hosts, workspaces e preferências sem senhas)',
    export_label_password: 'Senha de Proteção do Backup *',
    export_placeholder_password: 'Crie uma senha forte para criptografar este backup...',
    export_label_password_confirm: 'Confirmar Senha *',
    export_placeholder_password_confirm: 'Digite a mesma senha novamente...',
    export_password_mismatch: 'As senhas digitadas não coincidem.',
    export_password_empty: 'Informe uma senha para proteger o arquivo de backup.',
    export_btn_action: 'Baixar Arquivo de Backup (.termix)',
    export_generating: 'Gerando arquivo de backup...',
    export_success: 'Backup exportado com sucesso!',
    export_error: 'Erro ao exportar backup: ',

    import_section_file: '1. Selecione o arquivo de backup (.termix ou .json):',
    import_dropzone_title: 'Arraste e solte o arquivo aqui ou clique para selecionar',
    import_dropzone_hint: 'Suporta arquivos criptografados .termix ou exportações .json',
    import_file_loaded: 'Arquivo carregado: {name} ({size})',
    import_encrypted_notice: '🔒 Este arquivo de backup está protegido com criptografia AES-256-GCM.',
    import_plain_notice: '📄 Arquivo de backup não criptografado detectado.',
    import_label_password: 'Senha de Descriptografia do Arquivo *',
    import_placeholder_password: 'Digite a senha utilizada na exportação do arquivo...',
    import_section_options: '2. Opções de Restauração e Conflito:',
    import_mode_merge: 'Mesclar e Atualizar (Recomendado: atualiza existentes e adiciona novos)',
    import_mode_add_new: 'Adicionar como Novos (Gera novos identificadores sem alterar itens existentes)',
    import_mode_replace: 'Substituir Tudo (Atenção: limpa banco atual e restaura backup integralmente)',
    import_include_hosts: 'Importar Hosts ({n} encontrados)',
    import_include_identities: 'Importar Identidades e Credenciais ({n} encontradas)',
    import_include_workspaces: 'Importar Workspaces ({n} encontrados)',
    import_include_settings: 'Importar Configurações Gerais e de IA',
    import_btn_action: 'Importar e Restaurar Dados',
    import_processing: 'Importando dados...',
    import_success_title: 'Importação Concluída com Sucesso!',
    import_success_details: '{hosts} hosts, {identities} identidades e {workspaces} workspaces importados.',
    import_error: 'Erro ao importar: ',
    import_need_file: 'Selecione um arquivo de backup antes de continuar.',
    import_wrong_password: 'Senha incorreta para descriptografia do arquivo de backup.',

    // Common Buttons & Actions
    btn_cancel: 'Cancelar',
    btn_save: 'Salvar',
    btn_close: 'Fechar',
    copied_to_clipboard: 'Copiado para a área de transferência!'
  },

  en: {
    // Topbar & Brand
    app_title: 'Termix • Multi-Terminal Dashboard',
    app_desc: 'Centralized dashboard for simultaneous multi-terminal management with Node.js, WebSockets, and xterm.js',
    brand_connecting: 'Connecting...',
    brand_connected: 'Connected',
    brand_disconnected: 'Disconnected',
    brand_pty: 'PTY',

    // Layout
    layout_title: 'Select Grid Layout',
    layout_header: 'Grid Layout',
    layout_auto: 'Auto Mosaic',
    layout_1col: '1 Column (Focus)',
    layout_2col: '2 Columns',
    layout_3col: '3 Columns',

    // Topbar Buttons
    btn_workspaces_title: 'Saved Workspaces (Alt + W or ⌘ + ⇧ + W)',
    btn_hosts_title: 'Hosts & Identities Manager (Alt + H or ⌘ + ⇧ + H)',
    btn_broadcast_title: 'Broadcast to All Terminals (Alt + B or ⌘ + B)',
    btn_ai_title: 'AI Assistant / Copilot (⌘ + I or Alt + I)',
    btn_ai_settings_title: 'AI Settings & Preferences',
    btn_backup_title: 'Export & Import Configs & Credentials (Alt + E)',
    btn_new_terminal_title: 'New Terminal (Alt + T or ⌘ + T)',
    btn_theme_toggle_title: 'Toggle Light / Dark Theme (Alt + J)',
    btn_language_title: 'Change Language',
    btn_help_title: 'Keyboard shortcuts & help',

    // Broadcast Bar
    broadcast_label: 'BROADCAST TO ALL',
    broadcast_placeholder: 'Type command and press Enter (e.g. ls -la, git status)...',
    broadcast_send: 'Send ↵',
    broadcast_ai_summary: 'Summarize outputs of all terminals with AI',
    broadcast_no_terminals: 'No active terminals to broadcast to.',

    // Empty State
    empty_title: 'No active terminals right now',
    empty_desc: 'Open local command-line sessions, connect to remote servers via SSH, or restore saved workspaces.',
    empty_btn_new: 'New Terminal',
    empty_btn_workspaces: 'Workspaces',
    empty_btn_hosts: 'Hosts & SSH',

    // Terminal Card
    term_focus_title: 'Focus terminal',
    term_maximize_title: 'Maximize terminal',
    term_restore_title: 'Restore grid',
    term_rename_title: 'Rename title',
    term_clear_title: 'Clear output (Ctrl + L)',
    term_copy_title: 'Copy all buffer content',
    term_duplicate_title: 'Duplicate this terminal',
    term_reconnect_title: 'Reconnect process',
    term_close_title: 'Close this terminal',
    term_status_active: 'Active',
    term_status_connecting: 'Connecting...',
    term_status_exited: 'Exited',
    term_rename_prompt: 'Enter new terminal title:',
    term_confirm_close: 'Do you really want to close this terminal?',
    term_copied_success: 'Terminal content copied!',

    // Footer
    footer_terms_zero: 'No active terminals',
    footer_terms_one: '1 active terminal',
    footer_terms_multi: '{n} active terminals',
    footer_connected: 'Connected to PTY Backend',
    footer_disconnected: 'Disconnected from Server',

    // Help Modal
    help_modal_title: 'About Termix',
    help_modal_desc: 'Professional desktop dashboard for simultaneous management of multiple local pseudoterminals and remote SSH connections.',
    help_shortcuts_title: 'Keyboard Shortcuts',
    help_shortcut_new: 'New local terminal',
    help_shortcut_broadcast: 'Toggle Broadcast bar',
    help_shortcut_copilot: 'AI Copilot Assistant',
    help_shortcut_hosts: 'Open Hosts Manager',
    help_shortcut_workspaces: 'Open Saved Workspaces',
    help_shortcut_backup: 'Export / Import Settings',
    help_shortcut_theme: 'Toggle light/dark theme',
    help_shortcut_clear: 'Clear active terminal',
    help_shortcut_close: 'Close active terminal',

    // Hosts & Identities Modal
    hosts_modal_title: 'Connection Manager',
    hosts_modal_subtitle: 'Remote SSH servers, local terminals, and protected keys',
    hosts_tab_hosts: 'Hosts & Connections',
    hosts_tab_identities: 'Identities & Keys',
    hosts_search_placeholder: 'Search hosts by name, host, tag...',
    hosts_filter_all: 'All Types',
    hosts_filter_ssh: 'SSH Only',
    hosts_filter_local: 'Local Only',
    hosts_group_tag: 'Group by Tag',
    hosts_group_none: 'No Grouping',
    hosts_btn_new_host: '+ New Host',
    hosts_btn_new_identity: '+ New Identity',
    hosts_btn_backup: 'Export / Import',
    hosts_empty_title: 'No hosts registered yet',
    hosts_empty_desc: 'Add your SSH servers or favorite local directories for 1-click fast connection.',
    hosts_identities_empty_title: 'No identities registered yet',
    hosts_identities_empty_desc: 'Create identities with encrypted passwords, private SSH keys, or PEM certificates to reuse across hosts.',
    host_action_connect: 'Connect',
    host_action_edit: 'Edit',
    host_action_duplicate: 'Duplicate',
    host_action_delete: 'Delete',
    host_confirm_delete: 'Are you sure you want to delete host "{name}"?',
    identity_confirm_delete: 'Are you sure you want to delete identity "{name}"?',

    // Host Form
    host_form_new_title: 'New Host',
    host_form_edit_title: 'Edit Host',
    host_form_subtitle: 'Configure remote SSH servers or local terminal shortcuts',
    host_label_name: 'Host Name *',
    host_placeholder_name: 'e.g. Production VPS, Staging API, Web Server',
    host_label_type: 'Connection Type *',
    host_type_ssh: 'Remote SSH',
    host_type_local: 'Local Terminal',
    host_label_color: 'Badge Color',
    host_label_hostname: 'Address / Hostname *',
    host_placeholder_hostname: 'e.g. 192.168.1.100 or vps.company.com',
    host_label_port: 'SSH Port *',
    host_label_identity: 'Identity (SSH Credentials)',
    host_identity_none: 'None (Enter password interactively in session)',
    host_link_create_identity: '+ Create New Identity',
    host_label_path: 'Initial Directory (CWD)',
    host_placeholder_path: 'e.g. /var/www/app or ~/projects',
    host_label_command: 'Startup Command (Automatic)',
    host_placeholder_command: 'e.g. htop, docker ps, tail -f logs.txt',
    host_label_tags: 'Tags (comma separated)',
    host_placeholder_tags: 'e.g. production, aws, web, database',
    host_save_success: 'Host saved successfully!',
    host_save_error: 'Error saving host: ',

    // Identity Form
    identity_form_new_title: 'New Identity',
    identity_form_edit_title: 'Edit Identity',
    identity_form_subtitle: 'Credentials stored locally with AES-256-GCM encryption',
    identity_label_name: 'Identity Name *',
    identity_placeholder_name: 'e.g. Production Root, Deploy Bot, AWS Key',
    identity_label_username: 'SSH Username *',
    identity_placeholder_username: 'e.g. root, ubuntu, debian, ec2-user',
    identity_label_auth_type: 'Authentication Method *',
    identity_auth_password: 'Password',
    identity_auth_key: 'Private Key (File)',
    identity_auth_passphrase: 'Key with Passphrase',
    identity_auth_cert: 'Certificate / PEM Key (Content)',
    identity_label_password: 'Password',
    identity_placeholder_password: 'Enter SSH user password',
    identity_label_key_path: 'Private Key File Path',
    identity_placeholder_key_path: 'e.g. ~/.ssh/id_rsa or /Users/name/.ssh/id_ed25519',
    identity_label_passphrase: 'Key Passphrase',
    identity_placeholder_passphrase: 'Passphrase for private key (if any)',
    identity_label_certificate: 'PEM Key / Certificate Content',
    identity_placeholder_certificate: 'Paste complete PEM / OpenSSH key content here...',
    identity_save_success: 'Identity saved successfully!',
    identity_save_error: 'Error saving identity: ',

    // Workspaces
    ws_modal_title: 'Saved Workspaces',
    ws_modal_subtitle: 'Open entire sets of terminals with a single click',
    ws_btn_save_current: 'Save Current Session as Workspace',
    ws_btn_new: '+ New Workspace',
    ws_empty_title: 'No workspaces saved yet',
    ws_empty_desc: 'Create your first workspace to launch multiple terminals simultaneously with one click.',
    ws_action_open: 'Open Workspace',
    ws_action_edit: 'Edit',
    ws_action_delete: 'Delete',
    ws_terminals_count: '{n} terminals',
    ws_form_new_title: 'New Workspace',
    ws_form_edit_title: 'Edit Workspace',
    ws_form_subtitle: 'Configure multiple terminals that will start together',
    ws_label_name: 'Workspace Name *',
    ws_placeholder_name: 'e.g. Backend Dev, Microservices, Monitoring',
    ws_label_layout: 'Default Layout',
    ws_label_color: 'Workspace Color',
    ws_label_desc: 'Description (Optional)',
    ws_placeholder_desc: 'e.g. 2 backend terminals, 1 frontend, and log tailing',
    ws_label_terminals: 'Terminals included in this workspace',
    ws_btn_add_term: '+ Add Terminal',
    ws_term_title_label: 'Title',
    ws_term_host_label: 'Host / Connection',
    ws_term_host_local: 'Default Local Terminal',
    ws_term_path_label: 'Directory',
    ws_term_command_label: 'Startup Command',
    ws_save_success: 'Workspace saved successfully!',
    ws_save_error: 'Error saving workspace: ',
    ws_confirm_delete: 'Are you sure you want to delete workspace "{name}"?',
    ws_need_one_terminal: 'Add at least one terminal to the workspace.',
    ws_open_session_first: 'Open at least one terminal before saving the session as a workspace.',

    // AI Copilot
    ai_copilot_title: 'Termix Copilot',
    ai_copilot_subtitle: 'Generate natural language commands and send to active terminal',
    ai_copilot_placeholder: 'e.g. Find all .log files larger than 100MB and compress with tar.gz...',
    ai_copilot_btn_generate: 'Generate Command ↵',
    ai_copilot_generating: 'Generating command with AI...',
    ai_copilot_btn_send: 'Send to Terminal',
    ai_copilot_btn_copy: 'Copy',
    ai_copilot_btn_explain: 'Explain Details',
    ai_copilot_danger_warning: 'Warning: This command may alter or delete system data.',
    ai_copilot_sent_success: 'Command sent to terminal!',

    // AI Diagnosis
    ai_diag_title: 'Smart Error Diagnosis',
    ai_diag_subtitle: 'Automatic terminal output analysis with suggested fix',
    ai_diag_analyzing: 'Analyzing output with AI DevOps engineer...',
    ai_diag_root_cause: 'Root Cause',
    ai_diag_explanation: 'Technical Explanation',
    ai_diag_suggested_command: 'Suggested Fix Command',
    ai_diag_preventive: 'Preventive Tip',
    ai_diag_btn_apply: 'Execute Fix in Terminal',

    // AI Broadcast Summary
    ai_broadcast_title: 'Multi-Terminal Broadcast Summary',
    ai_broadcast_subtitle: 'Automated synthesis of responses from all active terminal instances',
    ai_broadcast_analyzing: 'Analyzing output from all terminals...',
    ai_broadcast_terminals_total: 'Terminals Analyzed',
    ai_broadcast_responses_ok: 'OK Responses',
    ai_broadcast_failures: 'With Failures / Anomalies',
    ai_broadcast_overview: 'Overview',
    ai_broadcast_discrepancies: 'Discrepancies Found',
    ai_broadcast_recommendation: 'Recommended Action:',

    // AI Settings & Preferences
    ai_settings_title: 'AI Settings & Preferences',
    ai_settings_subtitle: 'Customize providers, encrypted keys, model, and language',
    ai_label_language: 'Interface Language',
    ai_label_provider: 'AI Provider *',
    ai_label_model: 'Model *',
    ai_model_help: 'Type any model name or select a suggestion below',
    ai_label_region: 'AWS Bedrock Region *',
    ai_region_hint: 'Region where Amazon Bedrock models are enabled in your AWS account.',
    ai_label_apikey: 'API Key',
    ai_key_help: 'Encrypted locally using AES-256-GCM',
    ai_key_placeholder: 'Paste your API key here (encrypted storage)...',
    ai_label_baseurl: 'Endpoint / Base URL (Optional or Local)',
    ai_baseurl_hint: 'Default for local Ollama: http://localhost:11434/v1',
    ai_label_redact: 'Mask passwords, Bearer tokens, and private keys before sending (Redaction)',
    ai_label_auto_suggest: 'Automatically suggest fix on error exit code',
    ai_key_none: 'No key configured for this provider.',
    ai_key_configured: 'Key securely configured: ',
    ai_btn_clear_key: 'Remove Key',
    ai_btn_test: 'Test Connection',
    ai_btn_save: 'Save Settings',
    ai_test_testing: 'Testing connection...',
    ai_test_success: 'Connection tested successfully! AI response received.',
    ai_test_error: 'Connection test failed: ',
    ai_save_success: 'Settings saved successfully!',

    // Export & Import (Backup) Modal
    backup_modal_title: 'Export & Import Settings',
    backup_modal_subtitle: 'Full backup and secure migration of hosts, identities, credentials, and workspaces',
    backup_tab_export: 'Export Data (Backup)',
    backup_tab_import: 'Import Data (Restore)',
    export_section_items: '1. Select items to include in backup:',
    export_item_hosts: 'Hosts & SSH Connections ({n} registered)',
    export_item_identities: 'Identities & Credentials ({n} registered)',
    export_item_workspaces: 'Saved Workspaces ({n} registered)',
    export_item_settings: 'AI Settings, Providers, Language, and Theme',
    export_section_security: '2. File Protection & Security:',
    export_mode_encrypted: 'Password Protect (AES-256-GCM Encryption - Recommended)',
    export_mode_encrypted_desc: 'The file will be encrypted with a 256-bit key derived from your password via PBKDF2 (100,000 iterations). Safe to store or transfer anywhere.',
    export_mode_plain: 'Export without Password (Open File)',
    export_mode_plain_with_creds: 'Include decrypted passwords and keys (Warning: will contain plain-text secrets)',
    export_mode_plain_no_creds: 'Omit sensitive credentials (Export only hosts, workspaces, and preferences without passwords)',
    export_label_password: 'Backup Protection Password *',
    export_placeholder_password: 'Create a strong password to encrypt this backup...',
    export_label_password_confirm: 'Confirm Password *',
    export_placeholder_password_confirm: 'Retype the password...',
    export_password_mismatch: 'The entered passwords do not match.',
    export_password_empty: 'Enter a password to protect the backup file.',
    export_btn_action: 'Download Backup File (.termix)',
    export_generating: 'Generating backup file...',
    export_success: 'Backup exported successfully!',
    export_error: 'Error exporting backup: ',

    import_section_file: '1. Select backup file (.termix or .json):',
    import_dropzone_title: 'Drag and drop file here or click to select',
    import_dropzone_hint: 'Supports encrypted .termix files or .json exports',
    import_file_loaded: 'File loaded: {name} ({size})',
    import_encrypted_notice: '🔒 This backup file is protected with AES-256-GCM encryption.',
    import_plain_notice: '📄 Unencrypted backup file detected.',
    import_label_password: 'File Decryption Password *',
    import_placeholder_password: 'Enter the password used when exporting the file...',
    import_section_options: '2. Restore & Conflict Options:',
    import_mode_merge: 'Merge & Update (Recommended: updates existing and adds new)',
    import_mode_add_new: 'Add as New (Generates new identifiers without changing existing items)',
    import_mode_replace: 'Replace All (Warning: clears current database and restores full backup)',
    import_include_hosts: 'Import Hosts ({n} found)',
    import_include_identities: 'Import Identities & Credentials ({n} found)',
    import_include_workspaces: 'Import Workspaces ({n} found)',
    import_include_settings: 'Import General & AI Settings',
    import_btn_action: 'Import & Restore Data',
    import_processing: 'Importing data...',
    import_success_title: 'Import Completed Successfully!',
    import_success_details: '{hosts} hosts, {identities} identities, and {workspaces} workspaces imported.',
    import_error: 'Error importing: ',
    import_need_file: 'Select a backup file before continuing.',
    import_wrong_password: 'Incorrect password for backup file decryption.',

    // Common Buttons & Actions
    btn_cancel: 'Cancel',
    btn_save: 'Save',
    btn_close: 'Close',
    copied_to_clipboard: 'Copied to clipboard!'
  },

  es: {
    // Topbar & Brand
    app_title: 'Termix • Multi-Terminal Dashboard',
    app_desc: 'Panel centralizado para la gestión simultánea de múltiples terminales con Node.js, WebSockets y xterm.js',
    brand_connecting: 'Conectando...',
    brand_connected: 'Conectado',
    brand_disconnected: 'Desconectado',
    brand_pty: 'PTY',

    // Layout
    layout_title: 'Seleccionar Diseño de Cuadrícula',
    layout_header: 'Diseño de Cuadrícula',
    layout_auto: 'Mosaico Auto',
    layout_1col: '1 Columna (Foco)',
    layout_2col: '2 Columnas',
    layout_3col: '3 Columnas',

    // Topbar Buttons
    btn_workspaces_title: 'Espacios Guardados (Alt + W o ⌘ + ⇧ + W)',
    btn_hosts_title: 'Gestor de Hosts e Identidades (Alt + H o ⌘ + ⇧ + H)',
    btn_broadcast_title: 'Transmitir a Todos los Terminales (Alt + B o ⌘ + B)',
    btn_ai_title: 'Asistente de IA / Copilot (⌘ + I o Alt + I)',
    btn_ai_settings_title: 'Configuración de IA y Preferencias',
    btn_backup_title: 'Exportar e Importar Configuraciones y Credenciales (Alt + E)',
    btn_new_terminal_title: 'Nuevo Terminal (Alt + T o ⌘ + T)',
    btn_theme_toggle_title: 'Alternar Tema Claro / Oscuro (Alt + J)',
    btn_language_title: 'Cambiar Idioma',
    btn_help_title: 'Atajos de teclado y ayuda',

    // Broadcast Bar
    broadcast_label: 'TRANSMITIR A TODOS',
    broadcast_placeholder: 'Escriba el comando y presione Enter (ej: ls -la, git status)...',
    broadcast_send: 'Enviar ↵',
    broadcast_ai_summary: 'Resumir salidas de todos los terminales con IA',
    broadcast_no_terminals: 'No hay terminales activos para transmitir.',

    // Empty State
    empty_title: 'No hay terminales activos en este momento',
    empty_desc: 'Abra sesiones de línea de comandos locales, conéctese a servidores remotos por SSH o restaure espacios de trabajo guardados.',
    empty_btn_new: 'Nuevo Terminal',
    empty_btn_workspaces: 'Espacios de Trabajo',
    empty_btn_hosts: 'Hosts y SSH',

    // Terminal Card
    term_focus_title: 'Enfocar terminal',
    term_maximize_title: 'Maximizar terminal',
    term_restore_title: 'Restaurar cuadrícula',
    term_rename_title: 'Renombrar título',
    term_clear_title: 'Limpiar salida (Ctrl + L)',
    term_copy_title: 'Copiar todo el contenido del búfer',
    term_duplicate_title: 'Duplicar este terminal',
    term_reconnect_title: 'Reconectar proceso',
    term_close_title: 'Cerrar este terminal',
    term_status_active: 'Activo',
    term_status_connecting: 'Conectando...',
    term_status_exited: 'Finalizado',
    term_rename_prompt: 'Ingrese el nuevo título del terminal:',
    term_confirm_close: '¿Realmente desea cerrar este terminal?',
    term_copied_success: '¡Contenido del terminal copiado!',

    // Footer
    footer_terms_zero: 'Ningún terminal activo',
    footer_terms_one: '1 terminal activo',
    footer_terms_multi: '{n} terminales activos',
    footer_connected: 'Conectado al Backend PTY',
    footer_disconnected: 'Desconectado del Servidor',

    // Help Modal
    help_modal_title: 'Acerca de Termix',
    help_modal_desc: 'Panel de escritorio profesional para la gestión simultánea de múltiples pseudoterminales locales y SSH remotos.',
    help_shortcuts_title: 'Atajos de Teclado',
    help_shortcut_new: 'Nuevo terminal local',
    help_shortcut_broadcast: 'Alternar barra de transmisión',
    help_shortcut_copilot: 'Asistente de IA Copilot',
    help_shortcut_hosts: 'Abrir Gestor de Hosts',
    help_shortcut_workspaces: 'Abrir Espacios Guardados',
    help_shortcut_backup: 'Exportar / Importar Configuraciones',
    help_shortcut_theme: 'Alternar tema claro/oscuro',
    help_shortcut_clear: 'Limpiar terminal activo',
    help_shortcut_close: 'Cerrar terminal activo',

    // Hosts & Identities Modal
    hosts_modal_title: 'Gestor de Conexiones',
    hosts_modal_subtitle: 'Servidores remotos SSH, terminales locales y claves protegidas',
    hosts_tab_hosts: 'Hosts y Conexiones',
    hosts_tab_identities: 'Identidades y Claves',
    hosts_search_placeholder: 'Buscar hosts por nombre, host, etiqueta...',
    hosts_filter_all: 'Todos los Tipos',
    hosts_filter_ssh: 'Solo SSH',
    hosts_filter_local: 'Solo Local',
    hosts_group_tag: 'Agrupar por Etiqueta',
    hosts_group_none: 'Sin Agrupar',
    hosts_btn_new_host: '+ Nuevo Host',
    hosts_btn_new_identity: '+ Nueva Identidad',
    hosts_btn_backup: 'Exportar / Importar',
    hosts_empty_title: 'No hay hosts registrados todavía',
    hosts_empty_desc: 'Añada sus servidores SSH o directorios locales favoritos para conexión rápida con 1 clic.',
    hosts_identities_empty_title: 'No hay identidades registradas todavía',
    hosts_identities_empty_desc: 'Cree identidades con contraseñas cifradas, claves SSH privadas o certificados PEM para reutilizar en sus hosts.',
    host_action_connect: 'Conectar',
    host_action_edit: 'Editar',
    host_action_duplicate: 'Duplicar',
    host_action_delete: 'Eliminar',
    host_confirm_delete: '¿Está seguro de que desea eliminar el host "{name}"?',
    identity_confirm_delete: '¿Está seguro de que desea eliminar la identidad "{name}"?',

    // Host Form
    host_form_new_title: 'Nuevo Host',
    host_form_edit_title: 'Editar Host',
    host_form_subtitle: 'Configure servidores SSH remotos o accesos a terminales locales',
    host_label_name: 'Nombre del Host *',
    host_placeholder_name: 'Ej: VPS Producción, API Staging, Servidor Web',
    host_label_type: 'Tipo de Conexión *',
    host_type_ssh: 'SSH Remoto',
    host_type_local: 'Terminal Local',
    host_label_color: 'Color / Etiqueta Visual',
    host_label_hostname: 'Dirección / Hostname *',
    host_placeholder_hostname: 'Ej: 192.168.1.100 o vps.empresa.com',
    host_label_port: 'Puerto SSH *',
    host_label_identity: 'Identidad (Credenciales SSH)',
    host_identity_none: 'Ninguna (Ingresar contraseña interactivamente)',
    host_link_create_identity: '+ Crear Nueva Identidad',
    host_label_path: 'Directorio Inicial (CWD)',
    host_placeholder_path: 'Ej: /var/www/app o ~/proyectos',
    host_label_command: 'Comando Automático al Conectar',
    host_placeholder_command: 'Ej: htop, docker ps, tail -f logs.txt',
    host_label_tags: 'Etiquetas (separadas por coma)',
    host_placeholder_tags: 'Ej: produccion, aws, web, base-datos',
    host_save_success: '¡Host guardado con éxito!',
    host_save_error: 'Error al guardar host: ',

    // Identity Form
    identity_form_new_title: 'Nueva Identidad',
    identity_form_edit_title: 'Editar Identidad',
    identity_form_subtitle: 'Credenciales cifradas localmente con AES-256-GCM',
    identity_label_name: 'Nombre de la Identidad *',
    identity_placeholder_name: 'Ej: Root Producción, Bot Despliegue, Clave AWS',
    identity_label_username: 'Usuario SSH *',
    identity_placeholder_username: 'Ej: root, ubuntu, debian, ec2-user',
    identity_label_auth_type: 'Método de Autenticación *',
    identity_auth_password: 'Contraseña (Password)',
    identity_auth_key: 'Clave Privada (Archivo)',
    identity_auth_passphrase: 'Clave con Frase Secreta',
    identity_auth_cert: 'Certificado / Clave PEM (Contenido)',
    identity_label_password: 'Contraseña de Acceso',
    identity_placeholder_password: 'Ingrese la contraseña del usuario SSH',
    identity_label_key_path: 'Ruta del Archivo de Clave Privada',
    identity_placeholder_key_path: 'Ej: ~/.ssh/id_rsa o /Users/nombre/.ssh/id_ed25519',
    identity_label_passphrase: 'Frase Secreta de la Clave',
    identity_placeholder_passphrase: 'Frase de desbloqueo de la clave privada (si existe)',
    identity_label_certificate: 'Contenido de la Clave / Certificado PEM',
    identity_placeholder_certificate: 'Pegue aquí el contenido completo de la clave PEM / OpenSSH...',
    identity_save_success: '¡Identidad guardada con éxito!',
    identity_save_error: 'Error al guardar identidad: ',

    // Workspaces
    ws_modal_title: 'Espacios de Trabajo Guardados',
    ws_modal_subtitle: 'Abra conjuntos completos de terminales con un solo clic',
    ws_btn_save_current: 'Guardar Sesión Actual como Espacio',
    ws_btn_new: '+ Nuevo Espacio',
    ws_empty_title: 'No hay espacios guardados todavía',
    ws_empty_desc: 'Cree su primer espacio de trabajo para iniciar múltiples terminales simultáneos con un clic.',
    ws_action_open: 'Abrir Espacio',
    ws_action_edit: 'Editar',
    ws_action_delete: 'Eliminar',
    ws_terminals_count: '{n} terminales',
    ws_form_new_title: 'Nuevo Espacio de Trabajo',
    ws_form_edit_title: 'Editar Espacio de Trabajo',
    ws_form_subtitle: 'Configure múltiples terminales que iniciarán juntos',
    ws_label_name: 'Nombre del Espacio *',
    ws_placeholder_name: 'Ej: Entorno Backend, Microservicios, Monitoreo',
    ws_label_layout: 'Diseño Predeterminado',
    ws_label_color: 'Color del Espacio',
    ws_label_desc: 'Descripción (Opcional)',
    ws_placeholder_desc: 'Ej: 2 terminales backend, 1 frontend y logs en vivo',
    ws_label_terminals: 'Terminales incluidos en este espacio',
    ws_btn_add_term: '+ Agregar Terminal',
    ws_term_title_label: 'Título',
    ws_term_host_label: 'Host / Conexión',
    ws_term_host_local: 'Terminal Local Predeterminado',
    ws_term_path_label: 'Directorio',
    ws_term_command_label: 'Comando Inicial',
    ws_save_success: '¡Espacio guardado con éxito!',
    ws_save_error: 'Error al guardar espacio: ',
    ws_confirm_delete: '¿Está seguro de que desea eliminar el espacio "{name}"?',
    ws_need_one_terminal: 'Agregue al menos un terminal al espacio.',
    ws_open_session_first: 'Abra al menos un terminal antes de guardar la sesión como espacio.',

    // AI Copilot
    ai_copilot_title: 'Termix Copilot',
    ai_copilot_subtitle: 'Genere comandos en lenguaje natural y envíe al terminal activo',
    ai_copilot_placeholder: 'Ej: Encontrar todos los archivos .log mayores a 100MB y comprimir con tar.gz...',
    ai_copilot_btn_generate: 'Generar Comando ↵',
    ai_copilot_generating: 'Generando comando con IA...',
    ai_copilot_btn_send: 'Enviar al Terminal',
    ai_copilot_btn_copy: 'Copiar',
    ai_copilot_btn_explain: 'Explicar Detalles',
    ai_copilot_danger_warning: 'Atención: Este comando puede alterar o eliminar datos del sistema.',
    ai_copilot_sent_success: '¡Comando enviado al terminal!',

    // AI Diagnosis
    ai_diag_title: 'Diagnóstico Inteligente de Error',
    ai_diag_subtitle: 'Análisis automático de salida del terminal con sugerencia de solución',
    ai_diag_analyzing: 'Analizando salida con ingeniero DevOps de IA...',
    ai_diag_root_cause: 'Causa Probable',
    ai_diag_explanation: 'Explicación Técnica',
    ai_diag_suggested_command: 'Comando de Corrección Sugerido',
    ai_diag_preventive: 'Consejo Preventivo',
    ai_diag_btn_apply: 'Ejecutar Corrección en el Terminal',

    // AI Broadcast Summary
    ai_broadcast_title: 'Resumen de Transmisión Multi-Terminal',
    ai_broadcast_subtitle: 'Síntesis automatizada de respuestas de todas las instancias activas',
    ai_broadcast_analyzing: 'Analizando salidas de todos los terminales...',
    ai_broadcast_terminals_total: 'Terminales Analizados',
    ai_broadcast_responses_ok: 'Respuestas OK',
    ai_broadcast_failures: 'Con Fallas / Anomalías',
    ai_broadcast_overview: 'Visión General',
    ai_broadcast_discrepancies: 'Discrepancias Encontradas',
    ai_broadcast_recommendation: 'Acción Recomendada:',

    // AI Settings & Preferences
    ai_settings_title: 'Configuración de IA y Preferencias',
    ai_settings_subtitle: 'Personalice proveedores, claves cifradas, modelo e idioma',
    ai_label_language: 'Idioma de la Interfaz (Language)',
    ai_label_provider: 'Proveedor de IA *',
    ai_label_model: 'Modelo *',
    ai_model_help: 'Escriba cualquier modelo o seleccione una sugerencia abajo',
    ai_label_region: 'Región AWS Bedrock *',
    ai_region_hint: 'Región donde los modelos de Amazon Bedrock están habilitados en su cuenta AWS.',
    ai_label_apikey: 'Clave de API (API Key)',
    ai_key_help: 'Cifrada localmente con AES-256-GCM',
    ai_key_placeholder: 'Pegue su clave aquí (almacenamiento cifrado)...',
    ai_label_baseurl: 'Endpoint / URL Base (Opcional o Local)',
    ai_baseurl_hint: 'Predeterminado para Ollama local: http://localhost:11434/v1',
    ai_label_redact: 'Enmascara contraseñas, tokens Bearer y claves privadas antes de enviar (Redaction)',
    ai_label_auto_suggest: 'Sugerir corrección automáticamente en caso de código de salida con error',
    ai_key_none: 'Ninguna clave configurada para este proveedor.',
    ai_key_configured: 'Clave configurada de forma segura: ',
    ai_btn_clear_key: 'Eliminar Clave',
    ai_btn_test: 'Probar Conexión',
    ai_btn_save: 'Guardar Configuración',
    ai_test_testing: 'Probando conexión...',
    ai_test_success: '¡Conexión probada con éxito! Respuesta de la IA recibida.',
    ai_test_error: 'Fallo en la prueba de conexión: ',
    ai_save_success: '¡Configuración guardada con éxito!',

    // Export & Import (Backup) Modal
    backup_modal_title: 'Exportar e Importar Configuraciones',
    backup_modal_subtitle: 'Copia de seguridad completa y migración segura de hosts, identidades, credenciales y espacios',
    backup_tab_export: 'Exportar Datos (Copia de Seguridad)',
    backup_tab_import: 'Importar Datos (Restaurar)',
    export_section_items: '1. Seleccione los elementos a incluir en la copia:',
    export_item_hosts: 'Hosts y Conexiones SSH ({n} registrados)',
    export_item_identities: 'Identidades y Credenciales ({n} registradas)',
    export_item_workspaces: 'Espacios de Trabajo Guardados ({n} registrados)',
    export_item_settings: 'Configuraciones de IA, Proveedores, Idioma y Tema',
    export_section_security: '2. Protección y Seguridad del Archivo:',
    export_mode_encrypted: 'Proteger con Contraseña (Cifrado AES-256-GCM - Recomendado)',
    export_mode_encrypted_desc: 'El archivo estará blindado con clave de 256 bits derivada de su contraseña mediante PBKDF2 (100.000 iteraciones). Seguro para transportar.',
    export_mode_plain: 'Exportar sin Contraseña (Archivo Abierto)',
    export_mode_plain_with_creds: 'Incluir contraseñas y claves descifradas (Aviso: contendrá secretos en texto plano)',
    export_mode_plain_no_creds: 'Omitir credenciales confidenciales (Exportar solo hosts, espacios y preferencias sin contraseñas)',
    export_label_password: 'Contraseña de Protección del Respaldo *',
    export_placeholder_password: 'Cree una contraseña segura para cifrar esta copia...',
    export_label_password_confirm: 'Confirmar Contraseña *',
    export_placeholder_password_confirm: 'Escriba la contraseña nuevamente...',
    export_password_mismatch: 'Las contraseñas ingresadas no coinciden.',
    export_password_empty: 'Ingrese una contraseña para proteger el archivo de respaldo.',
    export_btn_action: 'Descargar Archivo de Copia (.termix)',
    export_generating: 'Generando archivo de respaldo...',
    export_success: '¡Copia de seguridad exportada con éxito!',
    export_error: 'Error al exportar respaldo: ',

    import_section_file: '1. Seleccione el archivo de respaldo (.termix o .json):',
    import_dropzone_title: 'Arrastre y suelte el archivo aquí o haga clic para seleccionar',
    import_dropzone_hint: 'Admite archivos cifrados .termix o exportaciones .json',
    import_file_loaded: 'Archivo cargado: {name} ({size})',
    import_encrypted_notice: '🔒 Este archivo de respaldo está protegido con cifrado AES-256-GCM.',
    import_plain_notice: '📄 Archivo de respaldo no cifrado detectado.',
    import_label_password: 'Contraseña de Descifrado del Archivo *',
    import_placeholder_password: 'Ingrese la contraseña utilizada al exportar el archivo...',
    import_section_options: '2. Opciones de Restauración y Conflicto:',
    import_mode_merge: 'Combinar y Actualizar (Recomendado: actualiza existentes y añade nuevos)',
    import_mode_add_new: 'Añadir como Nuevos (Genera nuevos identificadores sin alterar elementos existentes)',
    import_mode_replace: 'Reemplazar Todo (Atención: borra base actual y restaura respaldo por completo)',
    import_include_hosts: 'Importar Hosts ({n} encontrados)',
    import_include_identities: 'Importar Identidades y Credenciales ({n} encontradas)',
    import_include_workspaces: 'Importar Espacios ({n} encontrados)',
    import_include_settings: 'Importar Configuraciones Generales y de IA',
    import_btn_action: 'Importar y Restaurar Datos',
    import_processing: 'Importando datos...',
    import_success_title: '¡Importación Completada con Éxito!',
    import_success_details: '{hosts} hosts, {identities} identidades y {workspaces} espacios importados.',
    import_error: 'Error al importar: ',
    import_need_file: 'Seleccione un archivo de respaldo antes de continuar.',
    import_wrong_password: 'Contraseña incorrecta para el descifrado del archivo de respaldo.',

    // Common Buttons & Actions
    btn_cancel: 'Cancelar',
    btn_save: 'Guardar',
    btn_close: 'Cerrar',
    copied_to_clipboard: '¡Copiado al portapapeles!'
  }
};

class TermixI18nManager {
  constructor() {
    this.currentLang = this.detectInitialLanguage();
    this.listeners = new Set();
  }

  detectInitialLanguage() {
    // 1. Preferência salva pelo usuário
    const saved = localStorage.getItem('termix_lang');
    if (saved && TERMIX_LANGUAGES[saved]) {
      return saved;
    }

    // 2. Idioma do navegador/sistema operacional
    try {
      const navLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
      if (navLang.startsWith('pt')) return 'pt';
      if (navLang.startsWith('es')) return 'es';
      if (navLang.startsWith('en')) return 'en';
    } catch (_) {}

    // 3. Padrão
    return 'pt';
  }

  getLanguage() {
    return this.currentLang;
  }

  getLanguages() {
    return TERMIX_LANGUAGES;
  }

  t(key, params = {}) {
    const langDict = TERMIX_TRANSLATIONS[this.currentLang] || TERMIX_TRANSLATIONS.pt;
    let text = langDict[key];
    if (text === undefined) {
      // Fallback para Português
      text = TERMIX_TRANSLATIONS.pt[key];
    }
    if (text === undefined) {
      return key;
    }

    // Interpolação de parâmetros {name}, {n}, etc.
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(k => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
      });
    }

    return text;
  }

  setLanguage(lang) {
    if (!TERMIX_LANGUAGES[lang]) return;
    this.currentLang = lang;
    localStorage.setItem('termix_lang', lang);

    // Atualiza atributo lang do elemento <html>
    const htmlLang = lang === 'pt' ? 'pt-BR' : (lang === 'es' ? 'es-ES' : 'en-US');
    document.documentElement.lang = htmlLang;

    // Aplica traduções no DOM
    this.applyToDOM();

    // Notifica ouvintes registrados
    this.listeners.forEach(cb => {
      try { cb(lang); } catch (e) { console.error('[Termix i18n] Erro no listener:', e); }
    });

    // Dispara evento global
    window.dispatchEvent(new CustomEvent('termix-language-changed', { detail: { language: lang } }));
  }

  onLanguageChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
    }
    return () => this.listeners.delete(callback);
  }

  applyToDOM(rootEl = document) {
    // 1. Textos simples: [data-i18n]
    rootEl.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = this.t(key);
      }
    });

    // 2. Placeholders: [data-i18n-placeholder]
    rootEl.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        el.setAttribute('placeholder', this.t(key));
      }
    });

    // 3. Tooltips e títulos: [data-i18n-title]
    rootEl.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        el.setAttribute('title', this.t(key));
      }
    });

    // 4. Acessibilidade aria-label: [data-i18n-aria]
    rootEl.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      if (key) {
        el.setAttribute('aria-label', this.t(key));
      }
    });

    // Atualiza o botão de idioma na interface se existir
    const currentLangObj = TERMIX_LANGUAGES[this.currentLang];
    const langBtnText = document.getElementById('active-language-label');
    if (langBtnText && currentLangObj) {
      langBtnText.textContent = `${currentLangObj.flag} ${currentLangObj.code.toUpperCase()}`;
    }

    // Atualiza classe ativa no dropdown de idiomas
    document.querySelectorAll('.language-dropdown-item').forEach(item => {
      if (item.getAttribute('data-lang') === this.currentLang) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Sincroniza select em modais (como o de preferências)
    const langSelect = document.getElementById('settings-select-language');
    if (langSelect && langSelect.value !== this.currentLang) {
      langSelect.value = this.currentLang;
    }
  }
}

// Instância global do gerenciador de idiomas
window.i18n = new TermixI18nManager();
window.t = (key, params) => window.i18n.t(key, params);
