import type { ApiErrorCode, CreateProfileBody, ProfileDto } from '@rainbow-pixel/shared';
import { clientEnv } from './env';
import { getAccessToken } from './supabase';

/** Códigos da API mais as falhas que acontecem antes de existir uma resposta válida. */
export type ApiFailureCode = ApiErrorCode | 'network_error' | 'invalid_response';

export class ApiError extends Error {
  /** Status HTTP da resposta. 0 quando não houve resposta. */
  readonly status: number;
  readonly code: ApiFailureCode;

  constructor(status: number, code: ApiFailureCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const SIGNED_OUT_MESSAGE = 'Faça login para continuar.';
const NETWORK_ERROR_MESSAGE =
  'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.';
const INVALID_RESPONSE_MESSAGE = 'O servidor respondeu de um jeito inesperado. Tente de novo.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Toda chamada leva o token do Supabase; o servidor tira dele quem é o jogador. */
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (token === null) {
    throw new ApiError(401, 'unauthorized', SIGNED_OUT_MESSAGE);
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  try {
    return await fetch(`${clientEnv.serverHttpUrl}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'network_error', NETWORK_ERROR_MESSAGE);
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function toApiError(status: number, body: unknown): ApiError {
  if (isRecord(body) && typeof body['error'] === 'string' && typeof body['message'] === 'string') {
    // O corpo de erro vem do nosso servidor, que só usa códigos de ApiErrorCode.
    return new ApiError(status, body['error'] as ApiErrorCode, body['message']);
  }
  return new ApiError(status, 'invalid_response', INVALID_RESPONSE_MESSAGE);
}

function parseProfile(status: number, body: unknown): ProfileDto {
  if (
    isRecord(body) &&
    typeof body['id'] === 'string' &&
    typeof body['nickname'] === 'string' &&
    typeof body['level'] === 'number' &&
    typeof body['xp'] === 'number' &&
    typeof body['createdAt'] === 'string'
  ) {
    return {
      id: body['id'],
      nickname: body['nickname'],
      level: body['level'],
      xp: body['xp'],
      createdAt: body['createdAt'],
    };
  }
  throw new ApiError(status, 'invalid_response', INVALID_RESPONSE_MESSAGE);
}

/** Perfil do jogador logado, ou null se ele ainda não criou um. */
export async function fetchMe(): Promise<ProfileDto | null> {
  const response = await request('/me');
  const body = await readJson(response);
  if (response.ok) {
    return parseProfile(response.status, body);
  }
  const error = toApiError(response.status, body);
  if (response.status === 404 && error.code === 'profile_not_found') {
    return null;
  }
  throw error;
}

export async function createProfile(nickname: string): Promise<ProfileDto> {
  const payload: CreateProfileBody = { nickname };
  const response = await request('/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await readJson(response);
  if (response.ok) {
    return parseProfile(response.status, body);
  }
  throw toApiError(response.status, body);
}
