import { AggregateRoot } from '../../../common/domain/aggregate-root';
import {
  AnyCollection,
  ICollection,
  MyCollectionFactory,
} from '../../../common/domain/my-collection';
import Uuid from '../../../common/domain/value-objects/uuid.vo';
import { CustomerJoinedWaitingList } from '../events/domain-events/customer-joined-waiting-list.event';
import { SpotOfferedToWaitingCustomer } from '../events/domain-events/spot-offered-to-waiting-customer.event';
import { CustomerId } from './customer.entity';
import { EventSectionId } from './event-section';
import { EventSpotId } from './event-spot';
import { EventId } from './event.entity';
import { WaitingListEntry } from './waiting-list-entry';

export class WaitingListId extends Uuid {}

export type CreateWaitingListCommand = {
  event_id: EventId;
  section_id: EventSectionId;
};

export type WaitingListConstructorProps = {
  id?: WaitingListId | string;
  event_id: EventId | string;
  section_id: EventSectionId | string;
};

export class WaitingList extends AggregateRoot {
  id: WaitingListId;
  event_id: EventId;
  section_id: EventSectionId;
  private _entries: ICollection<WaitingListEntry>;

  constructor(props: WaitingListConstructorProps) {
    super();
    this.id =
      typeof props.id === 'string'
        ? new WaitingListId(props.id)
        : props.id ?? new WaitingListId();
    this.event_id =
      props.event_id instanceof EventId
        ? props.event_id
        : new EventId(props.event_id);
    this.section_id =
      props.section_id instanceof EventSectionId
        ? props.section_id
        : new EventSectionId(props.section_id);
    this._entries = MyCollectionFactory.create<WaitingListEntry>(this);
  }

  static create(command: CreateWaitingListCommand) {
    return new WaitingList(command);
  }

  join(customer_id: CustomerId) {
    const pendingEntry = this.entries.find(
      (entry) => entry.isPending() && entry.customer_id.equals(customer_id),
    );
    if (pendingEntry) {
      throw new Error('Customer already in waiting list');
    }

    const entry = WaitingListEntry.create({
      customer_id,
      position: this.nextPosition(),
    });
    this.entries.add(entry);
    this.addEvent(
      new CustomerJoinedWaitingList(
        this.id,
        this.event_id,
        this.section_id,
        entry.customer_id,
        entry.position,
      ),
    );
    return entry;
  }

  // Product decision: the first pending customer is only notified, no spot is reserved.
  offerSpotToFirstPendingCustomer(spot_id: EventSpotId) {
    const entry = this.orderedEntries().find((entry) => entry.isPending());
    if (!entry) {
      return null;
    }

    entry.markAsNotified();
    this.addEvent(
      new SpotOfferedToWaitingCustomer(
        this.id,
        entry.customer_id,
        this.event_id,
        this.section_id,
        spot_id,
      ),
    );
    return entry;
  }

  orderedEntries(): WaitingListEntry[] {
    return [...this.entries.values()].sort((a, b) => a.position - b.position);
  }

  private nextPosition() {
    return (
      this.entries
        .map((entry) => entry.position)
        .reduce((last, position) => Math.max(last, position), 0) + 1
    );
  }

  get entries(): ICollection<WaitingListEntry> {
    return this._entries as ICollection<WaitingListEntry>;
  }

  set entries(entries: AnyCollection<WaitingListEntry>) {
    this._entries = MyCollectionFactory.createFrom<WaitingListEntry>(entries);
  }

  toJSON() {
    return {
      id: this.id.value,
      event_id: this.event_id.value,
      section_id: this.section_id.value,
      entries: this.orderedEntries().map((entry) => entry.toJSON()),
    };
  }
}
