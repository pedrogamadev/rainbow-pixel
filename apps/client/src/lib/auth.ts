// Sessão do jogador: quem está logado e se já tem perfil.
// Fica fora do React, como o estado do lobby, e as telas leem com useAuth().

import type { ProfileDto } from '@rainbow-pixel/shared';
import { useSyncExternalStore } from 'react';
import { ApiError, fetchMe } from './api';
import { leaveLobby } from './colyseus';
import { getSupabase } from './supabase';

export type AuthState =
  | { readonly status: 'loading' }
  | { readonly status: 'signed_out' }
  /** Logado, mas `GET /me` respondeu 404: falta criar o perfil. */
  | { readonly status: 'needs_profile' }
  | { readonly status: 'ready'; readonly profile: ProfileDto }
  /** Logado, mas não deu para carregar o perfil. */
  | { readonly status: 'error'; readonly message: string };

const PROFILE_LOAD_FAILED_MESSAGE = 'Não foi possível carregar seu perfil. Tente de novo.';

let state: AuthState = { status: 'loading' };
const listeners = new Set<() => void>();

function setState(next: AuthState): void {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getState(): AuthState {
  return state;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getState);
}

/** Muda a cada carga de perfil e a cada logout. Uma resposta atrasada de outra conta é ignorada. */
let loadSequence = 0;

/** Busca o perfil do jogador logado em `GET /me`. */
export async function loadProfile(): Promise<void> {
  loadSequence += 1;
  const sequence = loadSequence;
  setState({ status: 'loading' });
  try {
    const profile = await fetchMe();
    if (sequence === loadSequence) {
      setState(profile === null ? { status: 'needs_profile' } : { status: 'ready', profile });
    }
  } catch (error) {
    if (sequence === loadSequence) {
      setState({
        status: 'error',
        message: error instanceof ApiError ? error.message : PROFILE_LOAD_FAILED_MESSAGE,
      });
    }
  }
}

/** Usado logo depois de criar o perfil, para não buscar de novo o que o servidor já devolveu. */
export function setAuthProfile(profile: ProfileDto): void {
  loadSequence += 1;
  setState({ status: 'ready', profile });
}

let started = false;
/** `undefined` até o Supabase dizer se existe sessão guardada. */
let currentUserId: string | null | undefined;

/** Começa a acompanhar a sessão do Supabase. Chamado uma vez, antes de renderizar. */
export function startAuth(): void {
  if (started) {
    return;
  }
  started = true;

  getSupabase().auth.onAuthStateChange((_event, session) => {
    const userId = session?.user.id ?? null;
    // Renovação de token e volta do foco para a aba repetem o evento para o mesmo jogador.
    if (userId === currentUserId) {
      return;
    }
    currentUserId = userId;

    if (userId === null) {
      loadSequence += 1;
      setState({ status: 'signed_out' });
      void leaveLobby();
      return;
    }

    setState({ status: 'loading' });
    // Fora do callback: o Supabase ainda está no meio da troca de sessão enquanto avisa.
    setTimeout(() => {
      if (currentUserId === userId) {
        void loadProfile();
      }
    }, 0);
  });
}

/** Sai da sala, se estiver em uma, e encerra a sessão só neste navegador. */
export async function signOut(): Promise<void> {
  await leaveLobby();
  const { error } = await getSupabase().auth.signOut({ scope: 'local' });
  if (error) {
    // A sessão local já foi apagada; só não deu para avisar o Supabase.
    console.warn(`[auth] logout não confirmado pelo Supabase: ${error.message}`);
  }
}
