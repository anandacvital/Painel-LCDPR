# src/workers — processamento em segundo plano

- `parser.worker.ts`: roda `analisarBytes` fora da tela, sem travar a página.
- `cliente.ts`: envia o arquivo ao Worker e devolve a análise como Promise.
- `mensagens.ts`: formato das mensagens entre tela e Worker.
