# src/parser — leitura e validação do TXT

| Arquivo | Papel |
|---|---|
| `leiaute.ts` | Tabela oficial dos registros e campos (leiaute 1.3). Mudou o leiaute? Ajuste aqui. |
| `encoding.ts` | Detecta UTF-8 / ISO-8859-1 e separa as linhas. |
| `parser.ts` | Lê linha a linha conferindo cada campo contra a tabela e monta o modelo. |
| `validacoes.ts` | Regras que cruzam registros: integridade, conciliação e riscos. |
| `analisar.ts` | Junta tudo: bytes do TXT → arquivo lido + relatório de saúde. |
| `modelo.ts` | Formato dos dados depois de lidos (valores em centavos). |
