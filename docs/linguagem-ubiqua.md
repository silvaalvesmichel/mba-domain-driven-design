# Linguagem ubíqua — Lista de Espera de Ingressos

Os termos abaixo são os mesmos usados no código (`apps/mba-ddd-venda-ingresso/src/@core/events`).

| Termo | Nome no código | Significado |
|---|---|---|
| Pedido | `Order` | Compra de um lugar por um cliente. Nasce `PENDING`, vira `PAID` quando o pagamento passa e `CANCELLED` quando é cancelado. |
| Cancelar pedido | `Order.cancel()` / `OrderService.cancel` | Comando que encerra um pedido pago ou pendente. Um pedido já cancelado não pode ser cancelado de novo (`Order already cancelled`). |
| Pedido cancelado | `OrderCancelled` | Evento de domínio registrado pelo pedido ao ser cancelado. Carrega o id do pedido, o status e o lugar (`event_spot_id`) que ele ocupava. |
| Lugar | `EventSpot` | Assento de uma seção do evento. Está reservado (`is_reserved = true`) ou disponível para reserva. |
| Reserva do lugar | `SpotReservation` | Trava que garante que um lugar pertence a um único cliente. É identificada pelo próprio lugar (`spot_id`) e é removida quando o lugar é liberado. |
| Liberar lugar | `Event.markSpotAsAvailable(spot_id)` | Devolve um lugar reservado para a venda. É a operação inversa de `markSpotAsReserved` e só acontece como reação ao cancelamento do pedido. |
| Lugar liberado | `EventSpotReleased` | Evento de domínio registrado pelo evento quando um lugar volta a ficar disponível. Carrega `event_id`, `section_id` e `spot_id`. |
| Seção esgotada | `Event.isSectionSoldOut(section_id)` | Seção sem nenhum lugar disponível para reserva. É calculada a partir dos lugares, nunca do contador `total_spots_reserved`. |
| Lista de espera | `WaitingList` | Fila de clientes interessados em uma seção esgotada. Existe uma lista por evento + seção (`event_id` + `section_id`). |
| Entrada da lista | `WaitingListEntry` | Posição de um cliente na lista de espera, com a ordem de chegada (`position`) e o status. |
| Entrada pendente | `WaitingListEntryStatus.PENDING` | Cliente que está aguardando um lugar. Um cliente só pode ter uma entrada pendente por lista (`Customer already in waiting list`). |
| Entrada notificada | `WaitingListEntryStatus.NOTIFIED` | Cliente que já foi avisado de que um lugar foi liberado. Não é notificado de novo. |
| Entrar na lista de espera | `WaitingList.join(customer_id)` / `WaitingListService.join` | Comando que coloca o cliente no fim da fila de uma seção esgotada (`Section is not sold out` se ainda houver lugar). |
| Cliente entrou na lista de espera | `CustomerJoinedWaitingList` | Evento de domínio registrado pela lista quando uma entrada pendente é criada. |
| Oferecer lugar ao primeiro da fila | `WaitingList.offerSpotToFirstPendingCustomer(spot_id)` | Política de produto: quando um lugar é liberado, a primeira entrada pendente passa a notificada. Só notifica — não reserva, não dá prioridade e não expira. |
| Lugar oferecido ao cliente da fila | `SpotOfferedToWaitingCustomer` | Evento de domínio registrado pela lista ao notificar o primeiro da fila. Carrega `customer_id`, `event_id`, `section_id` e `spot_id`. |
| Aviso para o contexto de e-mails | `SpotOfferedToWaitingCustomerIntegrationEvent` | Evento de integração publicado para fora do contexto de venda de ingressos, consumido pela aplicação `emails`. |
