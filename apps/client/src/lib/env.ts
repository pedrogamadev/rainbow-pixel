// Configuração do cliente, lida das variáveis VITE_* de apps/client/.env.
// Tudo que está aqui vai para o navegador: só entram valores públicos.

export interface ClientEnv {
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
  /** Endereço da API REST, sem barra no fim. */
  readonly serverHttpUrl: string;
  /** Endereço do WebSocket do Colyseus, sem barra no fim. */
  readonly serverWsUrl: string;
  /** Ferramentas de teste: sessão por aba e acesso rápido às contas de teste. */
  readonly devTools: boolean;
  /** Senha das contas de teste. Vazia quando não foi configurada. */
  readonly devSeedPassword: string;
}

export interface RawClientEnv {
  readonly VITE_SUPABASE_URL: string | undefined;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string | undefined;
  readonly VITE_SERVER_HTTP_URL: string | undefined;
  readonly VITE_SERVER_WS_URL: string | undefined;
  readonly VITE_DEV_TOOLS: string | undefined;
  readonly VITE_DEV_SEED_PASSWORD: string | undefined;
}

export interface ParsedClientEnv {
  readonly env: ClientEnv;
  /** Problemas de configuração, em PT-BR. Vazio quando está tudo certo. */
  readonly problems: readonly string[];
}

function readUrl(
  name: string,
  value: string | undefined,
  protocols: readonly string[],
  problems: string[],
): string {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') {
    problems.push(`${name} não foi definida.`);
    return '';
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    problems.push(`${name} não é um endereço válido.`);
    return '';
  }
  if (!protocols.includes(url.protocol)) {
    const expected = protocols.map((protocol) => `${protocol}//`).join(' ou ');
    problems.push(`${name} precisa começar com ${expected}.`);
    return '';
  }
  return trimmed.replace(/\/+$/, '');
}

export function parseClientEnv(raw: RawClientEnv): ParsedClientEnv {
  const problems: string[] = [];

  const supabaseUrl = readUrl(
    'VITE_SUPABASE_URL',
    raw.VITE_SUPABASE_URL,
    ['http:', 'https:'],
    problems,
  );
  const supabasePublishableKey = (raw.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  if (supabasePublishableKey === '') {
    problems.push('VITE_SUPABASE_PUBLISHABLE_KEY não foi definida.');
  }
  const serverHttpUrl = readUrl(
    'VITE_SERVER_HTTP_URL',
    raw.VITE_SERVER_HTTP_URL,
    ['http:', 'https:'],
    problems,
  );
  const serverWsUrl = readUrl(
    'VITE_SERVER_WS_URL',
    raw.VITE_SERVER_WS_URL,
    ['ws:', 'wss:'],
    problems,
  );

  return {
    env: {
      supabaseUrl,
      supabasePublishableKey,
      serverHttpUrl,
      serverWsUrl,
      devTools: raw.VITE_DEV_TOOLS === 'true',
      devSeedPassword: raw.VITE_DEV_SEED_PASSWORD ?? '',
    },
    problems,
  };
}

// Cada variável é lida pelo nome para o Vite trocar só o valor dela no build.
const parsed = parseClientEnv({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_SERVER_HTTP_URL: import.meta.env.VITE_SERVER_HTTP_URL,
  VITE_SERVER_WS_URL: import.meta.env.VITE_SERVER_WS_URL,
  // Ferramentas de teste nunca rodam em build de produção. Como `PROD` é resolvido no build,
  // a senha das contas de teste nem chega a entrar no pacote.
  VITE_DEV_TOOLS: import.meta.env.PROD ? undefined : import.meta.env.VITE_DEV_TOOLS,
  VITE_DEV_SEED_PASSWORD: import.meta.env.PROD ? undefined : import.meta.env.VITE_DEV_SEED_PASSWORD,
});

export const clientEnv: ClientEnv = parsed.env;

export const envProblems: readonly string[] = parsed.problems;
