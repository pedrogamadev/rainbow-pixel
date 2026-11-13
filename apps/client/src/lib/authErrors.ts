// Mensagens em PT-BR para os erros do Supabase Auth no login e no cadastro.

/** Tamanho mínimo de senha do Supabase Auth (valor padrão do projeto). */
export const AUTH_PASSWORD_MIN_LENGTH = 6;

/** Os campos de um erro do Supabase Auth que importam aqui. */
export interface AuthErrorLike {
  readonly code?: string | undefined;
  readonly status?: number | undefined;
  readonly name?: string | undefined;
}

export const AUTH_MESSAGES = {
  invalidCredentials: 'E-mail ou senha incorretos.',
  emailNotConfirmed: 'Confirme seu e-mail antes de entrar.',
  emailTaken: 'Já existe uma conta com esse e-mail.',
  weakPassword: `Senha fraca. Use pelo menos ${AUTH_PASSWORD_MIN_LENGTH} caracteres.`,
  invalidEmail: 'Informe um e-mail válido.',
  rateLimited: 'Muitas tentativas. Espere um pouco e tente de novo.',
  signupDisabled: 'O cadastro de novas contas está desativado.',
  unavailable: 'Não foi possível falar com o serviço de login. Verifique sua conexão.',
  generic: 'Não foi possível concluir. Tente de novo.',
} as const;

export function describeAuthError(error: AuthErrorLike): string {
  switch (error.code) {
    case 'invalid_credentials':
      return AUTH_MESSAGES.invalidCredentials;
    case 'email_not_confirmed':
      return AUTH_MESSAGES.emailNotConfirmed;
    case 'user_already_exists':
    case 'email_exists':
      return AUTH_MESSAGES.emailTaken;
    case 'weak_password':
      return AUTH_MESSAGES.weakPassword;
    case 'email_address_invalid':
    case 'validation_failed':
      return AUTH_MESSAGES.invalidEmail;
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return AUTH_MESSAGES.rateLimited;
    case 'signup_disabled':
    case 'email_provider_disabled':
      return AUTH_MESSAGES.signupDisabled;
    default:
      break;
  }

  if (error.status === 429) {
    return AUTH_MESSAGES.rateLimited;
  }
  // Sem resposta do Supabase (rede fora do ar) ou serviço indisponível.
  if (
    error.name === 'AuthRetryableFetchError' ||
    error.status === 0 ||
    (error.status !== undefined && error.status >= 500)
  ) {
    return AUTH_MESSAGES.unavailable;
  }
  return AUTH_MESSAGES.generic;
}
