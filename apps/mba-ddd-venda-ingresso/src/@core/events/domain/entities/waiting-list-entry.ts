import { Entity } from '../../../common/domain/entity';
import Uuid from '../../../common/domain/value-objects/uuid.vo';
import { CustomerId } from './customer.entity';

export enum WaitingListEntryStatus {
  PENDING = 'PENDING',
  NOTIFIED = 'NOTIFIED',
}

export class WaitingListEntryId extends Uuid {}

export type WaitingListEntryCreateCommand = {
  customer_id: CustomerId;
  position: number;
};

export type WaitingListEntryConstructorProps = {
  id?: WaitingListEntryId | string;
  customer_id: CustomerId | string;
  status: WaitingListEntryStatus;
  position: number;
  joined_at: Date;
};

export class WaitingListEntry extends Entity {
  id: WaitingListEntryId;
  customer_id: CustomerId;
  status: WaitingListEntryStatus;
  position: number;
  joined_at: Date;

  constructor(props: WaitingListEntryConstructorProps) {
    super();
    this.id =
      typeof props.id === 'string'
        ? new WaitingListEntryId(props.id)
        : props.id ?? new WaitingListEntryId();
    this.customer_id =
      props.customer_id instanceof CustomerId
        ? props.customer_id
        : new CustomerId(props.customer_id);
    this.status = props.status;
    this.position = props.position;
    this.joined_at = props.joined_at;
  }

  static create(command: WaitingListEntryCreateCommand) {
    return new WaitingListEntry({
      customer_id: command.customer_id,
      status: WaitingListEntryStatus.PENDING,
      position: command.position,
      joined_at: new Date(),
    });
  }

  isPending() {
    return this.status === WaitingListEntryStatus.PENDING;
  }

  markAsNotified() {
    this.status = WaitingListEntryStatus.NOTIFIED;
  }

  toJSON() {
    return {
      id: this.id.value,
      customer_id: this.customer_id.value,
      status: this.status,
      position: this.position,
      joined_at: this.joined_at,
    };
  }
}
