/**
 * Cabeçalhos de CORS para uma requisição.
 * Só libera origem que esteja na lista de CORS_ORIGINS. Vale para a API e para o matchmaking.
 */
export function buildCorsHeaders(
  origin: string | null | undefined,
  allowedOrigins: readonly string[],
): Record<string, string> {
  // A resposta depende da origem: caches não podem reaproveitar a de outra origem.
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (typeof origin === 'string' && origin !== '' && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}
