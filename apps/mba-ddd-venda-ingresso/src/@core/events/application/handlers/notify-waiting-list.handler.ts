import { IDomainEventHandler } from '../../../common/application/domain-event-handler.interface';
import { DomainEventManager } from '../../../common/domain/domain-event-manager';
import { EventSpotReleased } from '../../domain/events/domain-events/event-spot-released.event';
import { IWaitingListRepository } from '../../domain/repositories/waiting-list-repository.interface';

export class NotifyWaitingListHandler implements IDomainEventHandler {
  constructor(
    private waitingListRepo: IWaitingListRepository,
    private domainEventManager: DomainEventManager,
  ) {}

  async handle(event: EventSpotReleased): Promise<void> {
    const waitingList = await this.waitingListRepo.findByEventAndSection(
      event.event_id,
      event.section_id,
    );

    if (!waitingList) {
      return;
    }

    const entry = waitingList.offerSpotToFirstPendingCustomer(event.spot_id);

    if (!entry) {
      return;
    }

    await this.waitingListRepo.add(waitingList);
    await this.domainEventManager.publish(waitingList);
    await this.domainEventManager.publishForIntegrationEvent(waitingList);
  }

  static listensTo(): string[] {
    return [EventSpotReleased.name];
  }
}
