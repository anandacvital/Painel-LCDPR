/**
 * Ícones vetoriais (SVG) do painel. Sem emojis, conforme o guia de design.
 * `currentColor` faz o ícone herdar a cor do texto ao redor.
 */
const svg = (corpo: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;

export const iconeBroto = svg('<path d="M12 21v-9"/><path d="M12 12c-4.5 0-7-3-7-7 4.5 0 7 3 7 7z"/><path d="M12 15c4.5 0 7-3 7-7-4.5 0-7 3-7 7z"/><path d="M5 21h14"/>');
export const iconeCadeado = svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
export const iconeLixeira = svg('<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>');
export const iconeErro = svg('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>');
export const iconeAlerta = svg('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/>');
export const iconeInfo = svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>');
export const iconeOk = svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>');
export const iconeDownload = svg('<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>');
export const iconeImpressora = svg('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>');
export const iconeArquivo = svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h6"/>');
export const iconeFechar = svg('<path d="M6 6l12 12M18 6L6 18"/>');
