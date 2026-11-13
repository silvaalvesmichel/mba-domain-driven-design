# MBA Full Cycle - Domain Driven Design

Este repositório contém o código-fonte e material didático do curso de Domain Driven Design do MBA Full Cycle.

O projeto é feito com Nestjs, mas o conteúdo é independente de linguagem ou framework.

## Pré-requisitos

- Node.js 18+
- Docker

## Executar o projeto

Suba as aplicações MySQL, RabbitMQ e Redis:

```bash
docker-compose up -d
```

Instale as dependências do Node.js:

```bash
npm install
```

Crie as tabelas a partir do `mikro-orm.config.ts`:

```bash
npx mikro-orm schema:fresh --run
```

Suba a API (porta 3000) e o consumidor de e-mails (porta 3001), cada um em um terminal:

```bash
npm run start:dev
```

```bash
npx nest start emails
```

Use o arquivo `api.http` como referência para fazer as requisições HTTP. Este arquivo funciona com a extensão [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) do VSCode.

## Rodar os testes

Os testes de aplicação e de repositório usam o MySQL do `docker-compose` (banco `events`, usuário `root`, senha `root`), então ele precisa estar no ar:

```bash
npm test
```

Cada teste de infraestrutura recria o banco com `orm.schema.refreshDatabase()` usando apenas as entidades daquele teste, e nenhum deles registra a tabela `stored_event`. Depois de rodar a suíte, recrie as tabelas antes de subir a API de novo, senão ela responde 500:

```bash
npx mikro-orm schema:fresh --run
```

## Desafio: Lista de Espera de Ingressos

Quando um pedido é cancelado, o lugar volta para a venda e o primeiro cliente da lista de espera daquela seção é avisado. Nada disso é feito pelo comando de cancelamento: os agregados conversam por eventos de domínio.

- Event Storming da funcionalidade: [docs/event-storming.excalidraw](docs/event-storming.excalidraw) (abrir em [excalidraw.com](https://excalidraw.com))
- Linguagem ubíqua: [docs/linguagem-ubiqua.md](docs/linguagem-ubiqua.md)

### Novos endpoints

| Método | Rota | O que faz |
|---|---|---|
| `POST` | `/events/{event_id}/orders/{order_id}/cancel` | Cancela o pedido e devolve o pedido com `status: CANCELLED` |
| `POST` | `/events/{event_id}/sections/{section_id}/waiting-list` | Coloca o cliente (`{ "customer_id": "..." }`) na lista de espera da seção esgotada |
| `GET` | `/events/{event_id}/sections/{section_id}/waiting-list` | Lista as entradas da fila em ordem de chegada, com o status |

O roteiro completo (parceiro, clientes A e B, evento, seção com um lugar, compra, fila e cancelamento) está no fim do `api.http`.

### Por que `WaitingList` é um agregado separado de `Event`

O `Event` já carrega as seções e todos os lugares de cada seção, e é carregado inteiro a cada operação. Colocar a fila dentro dele faria o agregado crescer sem limite (uma entrada por cliente interessado) e faria toda entrada na fila disputar a mesma transação com a venda e a configuração do evento, sem que exista uma invariante que precise das duas coisas juntas: a regra da fila (ordem de chegada, uma entrada pendente por cliente, notificar o primeiro) não depende do estado dos lugares, só de saber que a seção está esgotada no momento da entrada. Por isso a `WaitingList` é uma raiz própria, pequena, com uma lista por `event_id` + `section_id`, que referencia `Event`, `EventSection` e `Customer` apenas por ID e é mantida consistente com o `Event` por evento de domínio (`EventSpotReleased`), não por transação compartilhada no modelo.

### A cadeia do cancelamento

O comando `OrderService.cancel` (rota `POST /events/{event_id}/orders/{order_id}/cancel`) roda dentro de `ApplicationService.run(...)`, carrega o `Order`, chama `Order.cancel()` e nada mais: ele não toca em `Event` nem em `WaitingList`. `Order.cancel()` registra o evento de domínio `OrderCancelled` (com o `event_spot_id`). Ao publicar esse evento, o `ReleaseSpotHandler` localiza o `Event` pelo lugar (`IEventRepository.findByEventSpotId`), chama `Event.markSpotAsAvailable(spot_id)`, que desce por `EventSection` até o `EventSpot` e registra `EventSpotReleased`, remove a `SpotReservation` do lugar e publica os eventos do `Event`. O `EventSpotReleased` aciona o `NotifyWaitingListHandler`, que carrega a `WaitingList` da seção (se não houver fila ou entrada pendente, termina sem efeito), chama `WaitingList.offerSpotToFirstPendingCustomer(spot_id)` — a primeira entrada `PENDING` vira `NOTIFIED` e a lista registra `SpotOfferedToWaitingCustomer` — e publica os eventos de domínio e de integração da lista. O `SpotOfferedToWaitingCustomer` é traduzido em `SpotOfferedToWaitingCustomerIntegrationEvent` no `EventsModule.onModuleInit` e enfileirado na fila Bull `integration-events`; o `IntegrationEventsPublisher` o publica no RabbitMQ (`amq.direct`, routing key igual ao nome do evento) e o `ConsumerService` da aplicação `emails` o consome e escreve um log estruturado com o cliente e a seção. Todos os eventos de domínio da cadeia ficam gravados em `stored_event`.

### Limitações encontradas

- O `ApplicationService` só publica eventos de integração dos agregados que já estavam na unidade de trabalho antes dos handlers rodarem. Como a `WaitingList` só entra nela dentro do `NotifyWaitingListHandler`, é o próprio handler que chama `publishForIntegrationEvent`. Com isso o evento de integração vai para a fila antes do `commit`; se o `commit` falhar, a mensagem já terá sido enfileirada (resolver isso exigiria um outbox, que está fora do escopo).
- Os handlers rodam dentro do `ApplicationService.finish()`, antes do `commit`, então o pedido cancelado, o lugar liberado, a remoção da `SpotReservation` e a entrada notificada são gravados no mesmo `flush`.
- O `Order` não guarda o evento a que pertence (só o lugar), então o `event_id` da rota de cancelamento não é usado para validar o pedido.

## Professor

<a href="https://github.com/argentinaluiz">
    <img src="https://avatars.githubusercontent.com/u/4926329?v=4?s=100" width="100px;" alt=""/>
    <br />
    <sub>
        <b>Luiz Carlos</b>
    </sub>
</a>
