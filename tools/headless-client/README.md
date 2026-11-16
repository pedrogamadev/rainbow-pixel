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
| `--humans <1..4>`                 | Com `--create`: inicia quando houver `n` humanos prontos (padrão 1)        |
| `--script <nome>`                 | `idle`, `circle`, `square`, `random-walk`, `strafe` ou `aim-test`          |
| `--duration <s>`                  | Duração do roteiro, contada do início da partida (padrão 60)               |
| `--seed <n>`                      | Semente do `random-walk` (padrão 1)                                        |
| `--weapon <primary\|secondary>`   | Arma que o roteiro segura (padrão `primary`)                               |
| `--axis <x\|y>`                   | Eixo do `strafe` (padrão `x`)                                              |
| `--fire-interval-ms <ms>`         | `aim-test`: intervalo mínimo entre disparos (padrão 300)                   |
| `--teleport <x,y>`                | Comando de debug: teleporta para (x, y) quando a partida começa            |
| `--god`                           | Comando de debug: vida infinita                                            |
| `--no-spread`                     | Comando de debug: dispersão zero nos próprios tiros (o recuo continua)     |
| `--latency`, `--jitter`, `--loss` | Simulador de lag deste cliente no servidor (ms, ms, %)                     |
| `--max-corrections-per-min <n>`   | Falha se houver mais de `n` correções acima de 4 px por minuto             |
| `--max-other-jump-px <px>`        | Falha se outro jogador saltar mais que isso entre dois quadros             |
| `--min-hit-ratio <0..1>`          | Falha se `hitRegRatio` ficar abaixo disso                                  |

Os comandos de debug (`--teleport`, `--god`, `--no-spread`) vão para o servidor assim que a partida começa; o servidor precisa estar com `DEV_TOOLS=true`.

### Roteiros

| Roteiro       | O que faz                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`        | Parado, mirando para o leste                                                                                                                                                                                                                                                                                                                                     |
| `circle`      | Anda em círculo pelas 8 direções                                                                                                                                                                                                                                                                                                                                 |
| `square`      | Anda em quadrado, 1,5 s em cada lado                                                                                                                                                                                                                                                                                                                             |
| `random-walk` | Caminhada aleatória com semente fixa                                                                                                                                                                                                                                                                                                                             |
| `strafe`      | Anda em `walk` no eixo de `--axis`, alternando entre −1 e 1 a cada 1500 ms (começa no −1): vai 210 px e volta                                                                                                                                                                                                                                                    |
| `aim-test`    | A cada tick, mira no centro do inimigo vivo mais próximo na visão interpolada (a mesma do cliente web). Dispara a cada `--fire-interval-ms` quando o raio local, sem dispersão, acerta o alvo sem passar por parede; solta o gatilho entre um disparo e outro (borda da semiautomática) e para de atirar no último 1,5 s, para os últimos `hit_confirm` chegarem |

O progresso vai para o stderr e o resumo em JSON fica sozinho no stdout: snapshots recebidos, intervalo médio entre snapshots, RTT médio, correções acima de 4 px (total e por minuto), maior correção, maior salto de outro jogador entre quadros e, do tiro:

- `shotsFired`: disparos previstos pelo cliente;
- `localHits`: disparos em que o raio local acertou a posição interpolada do alvo;
- `confirmedHits`: desses, os que o servidor confirmou (`hit_confirm` com o mesmo `seq`);
- `hitRegRatio`: `confirmedHits / localHits`;
- `averageRewindMs`: média da volta no tempo estimada pelo cliente (relógio do servidor visto pelo cliente + RTT − `viewTimeMs`). O servidor volta no máximo 200 ms;
- `enemyHealthLeaks`: jogadores de outro time que vieram com vida em algum snapshot (tem de ser 0).

Códigos de saída: `0` tudo certo, `1` algum limite violado, `2` erro (login, conexão, partida que não começou ou acabou antes do fim do roteiro).

## Registro de acertos (critério 2 do marco 0.3)

Posições no `gym_01`: o pátio aberto a oeste do prédio (células x 2 a 29, de 16 a 240 px; y de 16 a 784 px) não tem pilar. O atirador fica em `28,400` e o alvo em `228,400`: 200 px de distância, linha de visada livre e linha de tiro horizontal. O alvo anda no eixo `y` (perpendicular), de y = 400 até y = 190 e de volta, com espaço livre de 190 a 610.

O alvo cria a sala e espera os 2 humanos (`--humans 2`), porque com `--create` sozinho a partida começaria antes do atirador entrar (durante a partida não entra humano novo):

```bash
# Terminal 1 (alvo): imprime o código da sala no stderr.
pnpm headless --user dev2 --create --humans 2 --script strafe --axis y --god --teleport 228,400 --duration 90

# Terminal 2 (atirador), com o código impresso pelo alvo: 150 ms de RTT.
pnpm headless --user dev1 --code <código> --script aim-test --weapon secondary --no-spread --teleport 28,400 --duration 60 --latency 75 --jitter 20 --loss 2 --min-hit-ratio 0.95

# O mesmo com 300 ms de RTT, sem limite (só para registrar o resultado).
pnpm headless --user dev1 --code <código> --script aim-test --weapon secondary --no-spread --teleport 28,400 --duration 60 --latency 150 --jitter 20 --loss 2
```

Para ler o resultado: a volta que o servidor precisa medir é a soma do atraso de descida do snapshot, dos 100 ms de interpolação e do atraso de subida do input. Com `--latency 75`, dá ~250 ms e o servidor limita em 200 ms: o alvo andou ~7 px a mais que o visto, dentro do raio de 12 px. Com `--latency 150`, dá ~400 ms: ~28 px a mais, e a maior parte dos tiros erra. O teste `src/hitRegistration.test.ts` roda esse mesmo cenário em processo (partida do servidor, simulador de lag e dois `GameClient`, sem rede e sem Supabase).

O simulador de lag atrasa o pong na volta, mas não o ping na ida: com `--latency 75`, o RTT medido pelo ping fica em ~75 ms, e a volta estimada no resumo (`averageRewindMs`) sai ~75 ms abaixo da real.

## Exemplos

```bash
# Critério 5 do marco 0.2: cria a sala, inicia e anda em círculo por 60 s.
pnpm headless --script circle --duration 60

# Critério 4: 150 ms de atraso, 20 ms de variação e 2% de perda, com 3 bots andando.
pnpm headless --create --bots 3 --script square --duration 60 --latency 150 --jitter 20 --loss 2 --max-corrections-per-min 6 --max-other-jump-px 32

# Completar a sala de outra pessoa (o host inicia quando todos estiverem prontos).
pnpm headless --user dev3 --code ABC123 --script random-walk --duration 120
```
