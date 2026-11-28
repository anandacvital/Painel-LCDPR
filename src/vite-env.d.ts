/** Variáveis de ambiente opcionais do Google Drive (ver src/config/google.ts). */
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_API_KEY?: string;
  readonly VITE_GOOGLE_NUMERO_PROJETO?: string;
}
