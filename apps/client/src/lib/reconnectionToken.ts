// Token de reconexão do Colyseus, guardado para sobreviver ao recarregar a página.
// Fica no sessionStorage: vale só para a aba em que o jogador entrou na sala.

const STORAGE_KEY = 'rainbow-pixel.lobby.reconnection-token';

export type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function saveReconnectionToken(storage: TokenStorage, token: string): void {
  try {
    storage.setItem(STORAGE_KEY, token);
  } catch {
    // Sem armazenamento (modo restrito do navegador), só não há reconexão ao recarregar.
  }
}

/**
 * Devolve o token salvo, se ele for da sala `code`.
 * O token do Colyseus tem o formato `roomId:segredo`, e o roomId é o código da sala.
 */
export function loadReconnectionToken(storage: TokenStorage, code: string): string | null {
  let token: string | null;
  try {
    token = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  const prefix = `${code}:`;
  if (token === null || !token.startsWith(prefix) || token.length === prefix.length) {
    return null;
  }
  return token;
}

export function clearReconnectionToken(storage: TokenStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Nada para limpar.
  }
}
