import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  InvalidTokenError,
  SUPABASE_AUDIENCE,
  createJwtVerifier,
  createSupabaseJwtVerifier,
  supabaseIssuer,
  supabaseJwksUrl,
} from './verifyJwt.js';
import type { VerifyJwt } from './verifyJwt.js';

// Todas as chaves são geradas no próprio teste. Nada aqui usa rede.

const SUPABASE_URL = 'https://example.supabase.co';
const ISSUER = supabaseIssuer(SUPABASE_URL);
const USER_ID = '3f2b8c1e-5a47-4d0b-9c36-1e7a2b9d4f10';
const SECRET = 'segredo-de-teste-com-pelo-menos-32-caracteres';

type SigningKey = Parameters<SignJWT['sign']>[0];

interface TokenOptions {
  readonly alg: string;
  readonly kid?: string;
  readonly sub?: string | null;
  readonly issuer?: string;
  readonly audience?: string;
  /** Segundos a partir de agora; negativo gera token expirado. */
  readonly expiresIn?: number;
  readonly email?: string;
}

async function signToken(key: SigningKey, options: TokenOptions): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT(options.email === undefined ? {} : { email: options.email })
    .setProtectedHeader(
      options.kid === undefined ? { alg: options.alg } : { alg: options.alg, kid: options.kid },
    )
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? SUPABASE_AUDIENCE)
    .setIssuedAt(now - 120)
    .setExpirationTime(now + (options.expiresIn ?? 3600));
  if (options.sub !== null) {
    jwt.setSubject(options.sub ?? USER_ID);
  }
  return jwt.sign(key);
}

describe('modo jwks (chave assimétrica)', () => {
  let privateKey: SigningKey;
  let otherPrivateKey: SigningKey;
  let verify: VerifyJwt;

  beforeAll(async () => {
    const pair = await generateKeyPair('ES256');
    const other = await generateKeyPair('ES256');
    privateKey = pair.privateKey;
    otherPrivateKey = other.privateKey;

    const publicJwk = await exportJWK(pair.publicKey);
    const jwks = createLocalJWKSet({
      keys: [{ ...publicJwk, kid: 'chave-1', alg: 'ES256', use: 'sig' }],
    });
    verify = createJwtVerifier({
      key: jwks,
      algorithms: ['ES256', 'RS256', 'EdDSA'],
      issuer: ISSUER,
      audience: SUPABASE_AUDIENCE,
    });
  });

  it('aceita token válido e devolve o id do usuário', async () => {
    const token = await signToken(privateKey, {
      alg: 'ES256',
      kid: 'chave-1',
      email: 'jogador@example.com',
    });
    await expect(verify(token)).resolves.toEqual({
      userId: USER_ID,
      email: 'jogador@example.com',
    });
  });

  it('devolve email nulo quando o token não tem email', async () => {
    const token = await signToken(privateKey, { alg: 'ES256', kid: 'chave-1' });
    await expect(verify(token)).resolves.toEqual({ userId: USER_ID, email: null });
  });

  it('recusa token expirado', async () => {
    const token = await signToken(privateKey, { alg: 'ES256', kid: 'chave-1', expiresIn: -60 });
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('recusa assinatura inválida (assinado com outra chave)', async () => {
    const token = await signToken(otherPrivateKey, { alg: 'ES256', kid: 'chave-1' });
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('recusa token adulterado', async () => {
    const token = await signToken(privateKey, { alg: 'ES256', kid: 'chave-1' });
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({
        sub: '11111111-2222-4333-8444-555555555555',
        iss: ISSUER,
        aud: SUPABASE_AUDIENCE,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    await expect(verify(`${header}.${forgedPayload}.${signature}`)).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it('recusa emissor ou audiência errados', async () => {
    const wrongIssuer = await signToken(privateKey, {
      alg: 'ES256',
      kid: 'chave-1',
      issuer: 'https://outro.supabase.co/auth/v1',
    });
    const wrongAudience = await signToken(privateKey, {
      alg: 'ES256',
      kid: 'chave-1',
      audience: 'anon',
    });
    await expect(verify(wrongIssuer)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(verify(wrongAudience)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('recusa token sem sub ou com sub que não é UUID', async () => {
    const withoutSub = await signToken(privateKey, { alg: 'ES256', kid: 'chave-1', sub: null });
    const badSub = await signToken(privateKey, { alg: 'ES256', kid: 'chave-1', sub: 'admin' });
    await expect(verify(withoutSub)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(verify(badSub)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('recusa token HS256 quando só chaves assimétricas são aceitas', async () => {
    const token = await signToken(new TextEncoder().encode(SECRET), { alg: 'HS256' });
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('recusa texto que não é JWT', async () => {
    await expect(verify('')).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(verify('abc')).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(verify('a.b.c')).rejects.toBeInstanceOf(InvalidTokenError);
  });
});

describe('modo secret (HS256)', () => {
  const key = new TextEncoder().encode(SECRET);
  const verify = createSupabaseJwtVerifier({
    mode: 'secret',
    supabaseUrl: SUPABASE_URL,
    jwtSecret: SECRET,
  });

  it('aceita token válido', async () => {
    const token = await signToken(key, { alg: 'HS256' });
    await expect(verify(token)).resolves.toEqual({ userId: USER_ID, email: null });
  });

  it('recusa token expirado', async () => {
    const token = await signToken(key, { alg: 'HS256', expiresIn: -60 });
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('recusa assinatura inválida (assinado com outro segredo)', async () => {
    const otherKey = new TextEncoder().encode('outro-segredo-de-teste-com-32-caracteres');
    const token = await signToken(otherKey, { alg: 'HS256' });
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('recusa token assinado com chave assimétrica', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const token = await signToken(privateKey, { alg: 'ES256' });
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('exige o segredo', () => {
    expect(() => createSupabaseJwtVerifier({ mode: 'secret', supabaseUrl: SUPABASE_URL })).toThrow(
      /SUPABASE_JWT_SECRET/,
    );
  });
});

describe('endereços do Supabase', () => {
  it('monta o emissor e a URL do JWKS a partir da URL do projeto', () => {
    expect(supabaseIssuer(SUPABASE_URL)).toBe('https://example.supabase.co/auth/v1');
    expect(supabaseJwksUrl(SUPABASE_URL).href).toBe(
      'https://example.supabase.co/auth/v1/.well-known/jwks.json',
    );
  });

  it('cria o verificador jwks sem acessar a rede', () => {
    expect(() =>
      createSupabaseJwtVerifier({ mode: 'jwks', supabaseUrl: SUPABASE_URL }),
    ).not.toThrow();
  });
});
