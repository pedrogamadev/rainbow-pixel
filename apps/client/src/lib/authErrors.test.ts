import { describe, expect, it } from 'vitest';
import { AUTH_MESSAGES, describeAuthError } from './authErrors';

describe('describeAuthError', () => {
  it('traduz os erros comuns de login e cadastro', () => {
    expect(describeAuthError({ code: 'invalid_credentials', status: 400 })).toBe(
      AUTH_MESSAGES.invalidCredentials,
    );
    expect(describeAuthError({ code: 'email_not_confirmed', status: 400 })).toBe(
      AUTH_MESSAGES.emailNotConfirmed,
    );
    expect(describeAuthError({ code: 'user_already_exists', status: 422 })).toBe(
      AUTH_MESSAGES.emailTaken,
    );
    expect(describeAuthError({ code: 'email_exists', status: 422 })).toBe(AUTH_MESSAGES.emailTaken);
    expect(describeAuthError({ code: 'weak_password', status: 422 })).toBe(
      AUTH_MESSAGES.weakPassword,
    );
    expect(describeAuthError({ code: 'email_address_invalid', status: 400 })).toBe(
      AUTH_MESSAGES.invalidEmail,
    );
    expect(describeAuthError({ code: 'signup_disabled', status: 422 })).toBe(
      AUTH_MESSAGES.signupDisabled,
    );
  });

  it('reconhece limite de tentativas pelo código ou pelo status', () => {
    expect(describeAuthError({ code: 'over_request_rate_limit', status: 429 })).toBe(
      AUTH_MESSAGES.rateLimited,
    );
    expect(describeAuthError({ status: 429 })).toBe(AUTH_MESSAGES.rateLimited);
  });

  it('avisa quando o serviço de login não respondeu', () => {
    expect(describeAuthError({ name: 'AuthRetryableFetchError', status: 0 })).toBe(
      AUTH_MESSAGES.unavailable,
    );
    expect(describeAuthError({ status: 503 })).toBe(AUTH_MESSAGES.unavailable);
  });

  it('usa a mensagem genérica para o que não conhece', () => {
    expect(describeAuthError({ code: 'algo_novo', status: 400 })).toBe(AUTH_MESSAGES.generic);
    expect(describeAuthError({})).toBe(AUTH_MESSAGES.generic);
  });
});
