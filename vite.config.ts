/**
 * Configuração do Vite (monta o site) e do Vitest (roda os testes).
 *
 * Pontos importantes:
 * - `base`: o GitHub Pages publica o site em /Painel-LCDPR/, então todos os
 *   caminhos de arquivos precisam começar por aí no build de produção.
 * - Política de segurança (CSP): no build de produção injetamos uma regra no
 *   HTML que PROÍBE o navegador de abrir conexões de rede a partir da página
 *   (connect-src 'none'). Assim, mesmo que no futuro alguém adicione por engano
 *   um código que tente enviar dados, o próprio navegador bloqueia. É a garantia
 *   técnica de que o TXT do LCDPR nunca sai do computador.
 */
import { defineConfig, type Plugin } from 'vite';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

/** Injeta a CSP só no build (o modo de desenvolvimento precisa de conexão local para recarregar a página). */
function politicaDeSeguranca(): Plugin {
  return {
    name: 'politica-de-seguranca',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Painel-LCDPR/' : '/',
  plugins: [politicaDeSeguranca()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
