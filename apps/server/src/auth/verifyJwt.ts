import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

/** Dados do usuário tirados de um token já validado. */
export interface AuthUser {
  /** Id do usuário no Supabase Auth (claim `sub`). É também o id do Profile. */
  readonly userId: string;
  readonly email: string | null;
}

export type VerifyJwt = (token: string) => Promise<AuthUser>;

export class InvalidTokenError extends Error {
  /** Motivo técnico, para log do servidor. Nunca contém o token. */
  readonly reason: string;

  constructor(reason = 'invalid_token', options?: ErrorOptions) {
    super('Token inválido ou expirado.', options);
    this.name = 'InvalidTokenError';
    this.reason = reason;
  }
}

/** Texto curto para log quando um token é recusado. Nunca inclui o token. */
export function describeAuthFailure(error: unknown): string {
  return error instanceof InvalidTokenError ? error.reason : 'unexpected_error';
}

/** Código do erro do jose (ERR_JWT_EXPIRED, ERR_JWKS_NO_MATCHING_KEY etc.). */
function failureReason(cause: unknown): string {
  if (typeof cause === 'object' && cause !== null && 'code' in cause) {
    const { code } = cause;
    if (typeof code === 'string') {
      return code;
    }
  }
  return 'verification_failed';
}

export interface JwtVerifierOptions {
  /** Chave simétrica (HS256) ou resolvedor de chaves públicas (JWKS). */
  readonly key: Uint8Array | JWTVerifyGetKey;
  readonly algorithms: readonly string[];
  readonly issuer: string;
  readonly audience: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Audiência dos tokens de usuário logado no Supabase. */
export const SUPABASE_AUDIENCE = 'authenticated';

/** Algoritmos assimétricos aceitos no modo `jwks`. */
const JWKS_ALGORITHMS = ['ES256', 'RS256', 'EdDSA'] as const;

export function createJwtVerifier(options: JwtVerifierOptions): VerifyJwt {
  const verifyOptions = {
    algorithms: [...options.algorithms],
    issuer: options.issuer,
    audience: options.audience,
  };

  return async (token) => {
    if (typeof token !== 'string' || token === '') {
      throw new InvalidTokenError('missing_token');
    }

    let payload;
    try {
      // A lista de algoritmos é fixa por modo: um token assinado com outro algoritmo é recusado.
      ({ payload } =
        typeof options.key === 'function'
          ? await jwtVerify(token, options.key, verifyOptions)
          : await jwtVerify(token, options.key, verifyOptions));
    } catch (cause) {
      throw new InvalidTokenError(failureReason(cause), { cause });
    }

    if (typeof payload.sub !== 'string' || !UUID_PATTERN.test(payload.sub)) {
      throw new InvalidTokenError('invalid_subject');
    }

    const email = payload['email'];
    return {
      userId: payload.sub.toLowerCase(),
      email: typeof email === 'string' && email !== '' ? email : null,
    };
  };
}

export interface SupabaseJwtVerifierOptions {
  readonly mode: 'jwks' | 'secret';
  /** URL do projeto, sem barra final. */
  readonly supabaseUrl: string;
  /** Obrigatório no modo `secret`. */
  readonly jwtSecret?: string | undefined;
}

export function supabaseIssuer(supabaseUrl: string): string {
  return `${supabaseUrl}/auth/v1`;
}

export function supabaseJwksUrl(supabaseUrl: string): URL {
  return new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
}

export function createSupabaseJwtVerifier(options: SupabaseJwtVerifierOptions): VerifyJwt {
  const issuer = supabaseIssuer(options.supabaseUrl);

  if (options.mode === 'secret') {
    if (options.jwtSecret === undefined || options.jwtSecret === '') {
      throw new Error('SUPABASE_JWT_SECRET é obrigatória quando AUTH_JWT_MODE=secret.');
    }
    return createJwtVerifier({
      key: new TextEncoder().encode(options.jwtSecret),
      algorithms: ['HS256'],
      issuer,
      audience: SUPABASE_AUDIENCE,
    });
  }

  return createJwtVerifier({
    key: createRemoteJWKSet(supabaseJwksUrl(options.supabaseUrl)),
    algorithms: JWKS_ALGORITHMS,
    issuer,
    audience: SUPABASE_AUDIENCE,
  });
}
