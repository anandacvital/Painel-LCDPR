/**
 * Configuração do Vite (monta o site) e do Vitest (roda os testes).
 *
 * Pontos importantes:
 * - `base`: o GitHub Pages publica o site em /Painel-LCDPR/, então todos os
 *   caminhos de arquivos começam por aí (inclusive no `npm run dev`).
 * - Política de segurança (CSP): no build de produção injetamos uma regra no
 *   HTML que PROÍBE o navegador de abrir conexões de rede a partir da página
 *   (connect-src 'none'). Assim, mesmo que no futuro alguém adicione por engano
 *   um código que tente enviar dados, o próprio navegador bloqueia. É a garantia
 *   técnica de que o TXT do LCDPR nunca sai do computador.
 */
import { execSync } from 'node:child_process';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Versão do site: data do build + código curto do commit. Aparece no rodapé da
 * página e dos relatórios, para saber se o navegador está com a versão mais nova
 * (uma aba aberta há dias continua com a versão antiga até recarregar).
 */
function versao(): string {
  let commit = (process.env.GITHUB_SHA ?? '').slice(0, 7);
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      commit = 'local';
    }
  }
  const hoje = new Date().toISOString().slice(0, 10).split('-').reverse().join('/');
  return `${hoje} · ${commit}`;
}

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

export default defineConfig({
  // Mesmo caminho em todos os modos (dev, preview e produção) para evitar
  // diferenças entre o que se testa localmente e o que vai para o ar.
  base: '/Painel-LCDPR/',
  plugins: [politicaDeSeguranca()],
  define: {
    __VERSAO__: JSON.stringify(versao()),
  },
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
});
