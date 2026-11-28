/**
 * Tipos mínimos das bibliotecas do Google carregadas na hora do clique
 * (Google Identity Services e Google Picker). Só o que o painel usa.
 */
interface RespostaTokenGoogle {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface ClienteTokenGoogle {
  requestAccessToken(opcoes?: { prompt?: string }): void;
}

interface DocumentoPicker {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number | string;
}

interface RespostaPicker {
  action: string;
  docs?: DocumentoPicker[];
}

interface VisaoPicker {
  setMimeTypes(tipos: string): VisaoPicker;
  setIncludeFolders(sim: boolean): VisaoPicker;
  setSelectFolderEnabled(sim: boolean): VisaoPicker;
  setEnableDrives(sim: boolean): VisaoPicker;
  setMode(modo: unknown): VisaoPicker;
  setLabel?(rotulo: string): VisaoPicker;
}

interface ConstrutorPicker {
  setAppId(id: string): ConstrutorPicker;
  setOAuthToken(token: string): ConstrutorPicker;
  setDeveloperKey(chave: string): ConstrutorPicker;
  addView(visao: VisaoPicker): ConstrutorPicker;
  enableFeature(recurso: unknown): ConstrutorPicker;
  setLocale(local: string): ConstrutorPicker;
  setTitle(titulo: string): ConstrutorPicker;
  setOrigin(origem: string): ConstrutorPicker;
  setCallback(cb: (r: RespostaPicker) => void): ConstrutorPicker;
  build(): { setVisible(sim: boolean): void };
}

interface Window {
  gapi?: { load(modulo: string, opcoes: { callback: () => void; onerror: () => void; timeout?: number; ontimeout?: () => void }): void };
  google?: {
    accounts?: {
      oauth2: {
        initTokenClient(config: {
          client_id: string;
          scope: string;
          callback: (r: RespostaTokenGoogle) => void;
          error_callback?: (e: { type?: string; message?: string }) => void;
        }): ClienteTokenGoogle;
        revoke(token: string, feito?: () => void): void;
      };
    };
    picker?: {
      DocsView: new (idVisao?: unknown) => VisaoPicker;
      PickerBuilder: new () => ConstrutorPicker;
      ViewId: { DOCS: unknown };
      DocsViewMode: { LIST: unknown };
      Feature: { MULTISELECT_ENABLED: unknown; SUPPORT_DRIVES: unknown };
      Action: { PICKED: string; CANCEL: string };
    };
  };
}
