import { IDomainEventHandler } from '../../../common/application/domain-event-handler.interface';
import { DomainEventManager } from '../../../common/domain/domain-event-manager';
import { OrderCancelled } from '../../domain/events/domain-events/order-cancelled.event';
import { IEventRepository } from '../../domain/repositories/event-repository.interface';
import { ISpotReservationRepository } from '../../domain/repositories/spot-reservation-repository.interface';

export class ReleaseSpotHandler implements IDomainEventHandler {
  constructor(
    private eventRepo: IEventRepository,
    private spotReservationRepo: ISpotReservationRepository,
    private domainEventManager: DomainEventManager,
  ) {}

  async handle(event: OrderCancelled): Promise<void> {
    const eventAggregate = await this.eventRepo.findByEventSpotId(
      event.event_spot_id,
    );

    if (!eventAggregate) {
      throw new Error('Event not found');
    }

    eventAggregate.markSpotAsAvailable(event.event_spot_id);
    await this.eventRepo.add(eventAggregate);

    const spotReservation = await this.spotReservationRepo.findById(
      event.event_spot_id,
    );

    if (spotReservation) {
      await this.spotReservationRepo.delete(spotReservation);
    }

    await this.domainEventManager.publish(eventAggregate);
  }

  static listensTo(): string[] {
    return [OrderCancelled.name];
  }
}
