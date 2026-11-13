import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientEnv } from './env';

const DEV_TAB_ID_KEY = 'rainbow-pixel.dev.tab-id';

let client: SupabaseClient | undefined;

/**
 * Sessão por aba (ferramentas de teste): a sessão fica no sessionStorage, então cada aba pode
 * estar logada numa conta diferente.
 * A chave também é por aba: o Supabase avisa login e logout às outras abas por um canal com o
 * nome dessa chave, e com uma chave única o login de uma aba trocaria a conta das demais.
 */
function devTabAuthOptions(): { storage: Storage; storageKey: string } {
  const storage = window.sessionStorage;
  let tabId = storage.getItem(DEV_TAB_ID_KEY);
  if (tabId === null) {
    // Só precisa ser diferente entre abas; não é um valor de segurança.
    tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    storage.setItem(DEV_TAB_ID_KEY, tabId);
  }
  return { storage, storageKey: `rainbow-pixel.dev.auth.${tabId}` };
}

export function getSupabase(): SupabaseClient {
  client ??= createClient(clientEnv.supabaseUrl, clientEnv.supabasePublishableKey, {
    auth: clientEnv.devTools ? devTabAuthOptions() : {},
  });
  return client;
}

/** Token de acesso do jogador logado (o Supabase renova quando preciso), ou null sem sessão. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}
