/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SERVER_HTTP_URL?: string;
  readonly VITE_SERVER_WS_URL?: string;
  readonly VITE_DEV_TOOLS?: string;
  readonly VITE_DEV_SEED_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
