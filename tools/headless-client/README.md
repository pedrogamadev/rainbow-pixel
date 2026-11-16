# tools/headless-client

Cliente sem tela para testes (seção 17 do escopo da 1.0). Faz login com uma conta de teste, entra na sala, roda um roteiro de inputs com a mesma conexão de jogo do cliente web (`apps/client/src/game/GameClient.ts`, com a mesma previsão e reconciliação) e imprime um resumo em JSON.

Só roda com `DEV_TOOLS=true` no próprio `.env` e nunca com `NODE_ENV=production` (usa o guard de `apps/server/src/dev/guard.ts`).

## Preparação

```bash
cp tools/headless-client/.env.example tools/headless-client/.env
```

Preencha `DEV_TOOLS=true`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `DEV_SEED_PASSWORD` (a mesma senha das contas criadas por `pnpm dev:seed-users`). O servidor precisa estar rodando com `DEV_TOOLS=true`.

## Uso

```bash
pnpm headless --user dev2 [--code ABC123 | --create] --script circle --duration 60 [--latency 150 --jitter 20 --loss 2]
```

| Opção                             | O que faz                                                                  |
| --------------------------------- | -------------------------------------------------------------------------- |
| `--user <dev1..dev4>`             | Conta de teste (padrão `dev1`)                                             |
| `--code <código>`                 | Entra na sala pelo código, marca pronto e espera o host iniciar            |
| `--create`                        | Cria a sala, marca pronto e inicia a partida na hora (padrão sem `--code`) |
| `--bots <0..3>`                   | Com `--create`: bots adicionados antes de iniciar                          |
| `--wait`                          | Com `--create`: não inicia; espera todos ficarem prontos (contagem normal) |
| `--script <nome>`                 | `idle`, `circle`, `square` ou `random-walk` (padrão `idle`)                |
| `--duration <s>`                  | Duração do roteiro, contada do início da partida (padrão 60)               |
| `--seed <n>`                      | Semente do `random-walk` (padrão 1)                                        |
| `--latency`, `--jitter`, `--loss` | Simulador de lag deste cliente no servidor (ms, ms, %)                     |
| `--max-corrections-per-min <n>`   | Falha se houver mais de `n` correções acima de 4 px por minuto             |
| `--max-other-jump-px <px>`        | Falha se outro jogador saltar mais que isso entre dois quadros             |

O progresso vai para o stderr e o resumo em JSON fica sozinho no stdout: snapshots recebidos, intervalo médio entre snapshots, RTT médio, correções acima de 4 px (total e por minuto), maior correção e maior salto de outro jogador entre quadros.

Códigos de saída: `0` tudo certo, `1` algum limite violado, `2` erro (login, conexão, partida que não começou ou acabou antes do fim do roteiro).

## Exemplos

```bash
# Critério 5 do marco 0.2: cria a sala, inicia e anda em círculo por 60 s.
pnpm headless --script circle --duration 60

# Critério 4: 150 ms de atraso, 20 ms de variação e 2% de perda, com 3 bots andando.
pnpm headless --create --bots 3 --script square --duration 60 --latency 150 --jitter 20 --loss 2 --max-corrections-per-min 6 --max-other-jump-px 32

# Completar a sala de outra pessoa (o host inicia quando todos estiverem prontos).
pnpm headless --user dev3 --code ABC123 --script random-walk --duration 120
```
