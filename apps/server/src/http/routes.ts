import { NICKNAME_ERROR_MESSAGES, validateNickname } from '@rainbow-pixel/shared';
import type { ApiErrorBody, ApiErrorCode } from '@rainbow-pixel/shared';
import express, { Router } from 'express';
import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { describeAuthFailure } from '../auth/verifyJwt.js';
import type { AuthUser, VerifyJwt } from '../auth/verifyJwt.js';
import { toProfileDto } from '../db/profiles.js';
import type { ProfileStore } from '../db/profiles.js';

export interface ApiDependencies {
  readonly verifyJwt: VerifyJwt;
  readonly profiles: ProfileStore;
}

/** Tamanho máximo do corpo JSON aceito pela API. */
const JSON_BODY_LIMIT = '10kb';

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

const createProfileBodySchema = z.object({ nickname: z.string() });

function sendError(res: Response, status: number, error: ApiErrorCode, message: string): void {
  const body: ApiErrorBody = { error, message };
  res.status(status).json(body);
}

/** Recusa a requisição sem JWT válido. O usuário validado fica em `res.locals`. */
function requireAuth(verifyJwt: VerifyJwt): RequestHandler {
  return async (req, res, next) => {
    const token = BEARER_PATTERN.exec(req.get('authorization') ?? '')?.[1];
    if (token === undefined) {
      sendError(res, 401, 'unauthorized', 'Faça login para continuar.');
      return;
    }
    try {
      res.locals['user'] = await verifyJwt(token);
    } catch (error) {
      console.warn(`[api] token recusado (${describeAuthFailure(error)})`);
      sendError(res, 401, 'unauthorized', 'Sessão inválida ou expirada. Faça login de novo.');
      return;
    }
    next();
  };
}

/** Só chamar em rotas depois de `requireAuth`. O id vem sempre do token, nunca do cliente. */
function authUser(res: Response): AuthUser {
  return res.locals['user'] as AuthUser;
}

const handleError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  // Erros do leitor de JSON (corpo malformado ou grande demais) trazem um status 4xx.
  const status =
    typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    sendError(res, 400, 'invalid_body', 'Corpo da requisição inválido.');
    return;
  }
  console.error('[api] erro inesperado:', error);
  sendError(res, 500, 'internal_error', 'Erro interno. Tente de novo em instantes.');
};

export function createApiRouter({ verifyJwt, profiles }: ApiDependencies): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Daqui para baixo, toda rota exige `Authorization: Bearer <jwt>`.
  router.use(requireAuth(verifyJwt));
  router.use(express.json({ limit: JSON_BODY_LIMIT }));

  router.get('/me', async (_req, res) => {
    const profile = await profiles.findById(authUser(res).userId);
    if (profile === null) {
      sendError(res, 404, 'profile_not_found', 'Você ainda não criou um perfil.');
      return;
    }
    res.json(toProfileDto(profile));
  });

  router.post('/profiles', async (req, res) => {
    const body = createProfileBodySchema.safeParse(req.body);
    if (!body.success) {
      sendError(res, 400, 'invalid_body', 'Informe o nickname.');
      return;
    }
    const { nickname } = body.data;

    const validation = validateNickname(nickname);
    if (!validation.ok) {
      sendError(res, 400, 'invalid_nickname', NICKNAME_ERROR_MESSAGES[validation.error]);
      return;
    }

    const result = await profiles.create(authUser(res).userId, nickname);
    if (!result.ok) {
      const message =
        result.error === 'nickname_taken'
          ? 'Esse nickname já está em uso. Escolha outro.'
          : 'Você já tem um perfil.';
      sendError(res, 409, result.error, message);
      return;
    }
    res.status(201).json(toProfileDto(result.profile));
  });

  router.use((_req, res) => {
    sendError(res, 404, 'not_found', 'Rota não encontrada.');
  });
  router.use(handleError);

  return router;
}
