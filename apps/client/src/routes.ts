/** Caminhos das telas. */
export const ROUTES = {
  login: '/login',
  register: '/register',
  createProfile: '/create-profile',
  home: '/',
  lobbyPattern: '/lobby/:code',
  lobby: (code: string): string => `/lobby/${code}`,
} as const;
