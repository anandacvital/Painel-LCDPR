# src/parser — leitura e validação do TXT

Transforma o texto do arquivo LCDPR em dados estruturados e aponta problemas.

- `encoding.ts`: detecta UTF-8 / ISO-8859-1 e separa as linhas.
- (Fase 1) tabela de definição de registros (campo, posição, tipo, obrigatório),
  leitor orientado a essa tabela e validações da aba "Saúde do Arquivo".
