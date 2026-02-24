/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_HEX_EMBED_URL_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
