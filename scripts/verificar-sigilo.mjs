/**
 * Verificação de sigilo: roda no CI a cada push e pode ser rodada à mão
 * com `npm run sigilo`.
 *
 * Falha (impede o merge) se algum arquivo versionado no Git:
 *   - for .txt, .pdf, .csv, .xls ou .xlsx FORA de tests/fixtures/; ou
 *   - estiver dentro da pasta dados/.
 *
 * É uma segunda barreira além do .gitignore: o .gitignore pode ser
 * contornado com `git add -f`; esta verificação não.
 */
import { execSync } from 'node:child_process';

const arquivos = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const proibido = /\.(txt|pdf|csv|xlsx?)$/i;

const problemas = arquivos.filter(
  (f) => (proibido.test(f) && !f.startsWith('tests/fixtures/')) || f.startsWith('dados/'),
);

if (problemas.length > 0) {
  console.error('ERRO DE SIGILO: arquivos que não podem estar no repositório:');
  for (const f of problemas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`Verificação de sigilo OK (${arquivos.length} arquivos conferidos).`);
