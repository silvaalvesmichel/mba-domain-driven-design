import { IDomainEvent } from '../../../../common/domain/domain-event';
import { EventSpotId } from '../../entities/event-spot';
import { OrderId, OrderStatus } from '../../entities/order.entity';

export class OrderCancelled implements IDomainEvent {
  readonly event_version: number = 1;
  readonly occurred_on: Date;

  constructor(
    readonly aggregate_id: OrderId,
    readonly status: OrderStatus,
    readonly event_spot_id: EventSpotId,
  ) {
    this.occurred_on = new Date();
  }
}
