import { CustomerId } from '../customer.entity';
import { EventSectionId } from '../event-section';
import { EventSpotId } from '../event-spot';
import { EventId } from '../event.entity';
import { WaitingList } from '../waiting-list.entity';
import { WaitingListEntryStatus } from '../waiting-list-entry';
import { CustomerJoinedWaitingList } from '../../events/domain-events/customer-joined-waiting-list.event';
import { SpotOfferedToWaitingCustomer } from '../../events/domain-events/spot-offered-to-waiting-customer.event';
import { initOrm } from './helpers';

describe('WaitingList Entity Unit Tests', () => {
  initOrm();

  function createWaitingList() {
    return WaitingList.create({
      event_id: new EventId(),
      section_id: new EventSectionId(),
    });
  }

  test('deve colocar o cliente na fila como pendente, na ordem de chegada', () => {
    const waitingList = createWaitingList();
    const customer1 = new CustomerId();
    const customer2 = new CustomerId();

    const entry1 = waitingList.join(customer1);
    const entry2 = waitingList.join(customer2);

    expect(waitingList.entries.size).toBe(2);
    expect(entry1.status).toBe(WaitingListEntryStatus.PENDING);
    expect(entry1.position).toBe(1);
    expect(entry2.status).toBe(WaitingListEntryStatus.PENDING);
    expect(entry2.position).toBe(2);
    expect(
      waitingList.orderedEntries().map((entry) => entry.customer_id.value),
    ).toEqual([customer1.value, customer2.value]);
  });

  test('deve registrar CustomerJoinedWaitingList ao entrar na fila', () => {
    const waitingList = createWaitingList();
    const customerId = new CustomerId();

    waitingList.join(customerId);

    expect(waitingList.events.size).toBe(1);
    const [event] = waitingList.events as Set<CustomerJoinedWaitingList>;
    expect(event).toBeInstanceOf(CustomerJoinedWaitingList);
    expect(event.aggregate_id.equals(waitingList.id)).toBe(true);
    expect(event.event_id.equals(waitingList.event_id)).toBe(true);
    expect(event.section_id.equals(waitingList.section_id)).toBe(true);
    expect(event.customer_id.equals(customerId)).toBe(true);
  });

  test('não deve aceitar o mesmo cliente com entrada pendente na mesma fila', () => {
    const waitingList = createWaitingList();
    const customerId = new CustomerId();
    waitingList.join(customerId);
    waitingList.clearEvents();

    expect(() => waitingList.join(new CustomerId(customerId.value))).toThrow(
      new Error('Customer already in waiting list'),
    );
    expect(waitingList.entries.size).toBe(1);
    expect(waitingList.events.size).toBe(0);
  });

  test('deve notificar a primeira entrada pendente quando um lugar é oferecido', () => {
    const waitingList = createWaitingList();
    const customer1 = new CustomerId();
    const customer2 = new CustomerId();
    const entry1 = waitingList.join(customer1);
    const entry2 = waitingList.join(customer2);
    waitingList.clearEvents();
    const spotId = new EventSpotId();

    const notified = waitingList.offerSpotToFirstPendingCustomer(spotId);

    expect(notified).toBe(entry1);
    expect(entry1.status).toBe(WaitingListEntryStatus.NOTIFIED);
    expect(entry2.status).toBe(WaitingListEntryStatus.PENDING);

    expect(waitingList.events.size).toBe(1);
    const [event] = waitingList.events as Set<SpotOfferedToWaitingCustomer>;
    expect(event).toBeInstanceOf(SpotOfferedToWaitingCustomer);
    expect(event.customer_id.equals(customer1)).toBe(true);
    expect(event.event_id.equals(waitingList.event_id)).toBe(true);
    expect(event.section_id.equals(waitingList.section_id)).toBe(true);
    expect(event.spot_id.equals(spotId)).toBe(true);
  });

  test('não deve notificar de novo uma entrada já notificada', () => {
    const waitingList = createWaitingList();
    const entry1 = waitingList.join(new CustomerId());
    const entry2 = waitingList.join(new CustomerId());

    waitingList.offerSpotToFirstPendingCustomer(new EventSpotId());
    const notified = waitingList.offerSpotToFirstPendingCustomer(
      new EventSpotId(),
    );

    expect(notified).toBe(entry2);
    expect(entry1.status).toBe(WaitingListEntryStatus.NOTIFIED);
    expect(entry2.status).toBe(WaitingListEntryStatus.NOTIFIED);
  });

  test('não deve fazer nada ao oferecer um lugar com a fila vazia', () => {
    const waitingList = createWaitingList();

    const notified = waitingList.offerSpotToFirstPendingCustomer(
      new EventSpotId(),
    );

    expect(notified).toBeNull();
    expect(waitingList.events.size).toBe(0);
  });

  test('não deve fazer nada ao oferecer um lugar sem entradas pendentes', () => {
    const waitingList = createWaitingList();
    waitingList.join(new CustomerId());
    waitingList.offerSpotToFirstPendingCustomer(new EventSpotId());
    waitingList.clearEvents();

    const notified = waitingList.offerSpotToFirstPendingCustomer(
      new EventSpotId(),
    );

    expect(notified).toBeNull();
    expect(waitingList.events.size).toBe(0);
  });

  test('deve permitir que um cliente já notificado entre de novo na fila', () => {
    const waitingList = createWaitingList();
    const customerId = new CustomerId();
    waitingList.join(customerId);
    waitingList.offerSpotToFirstPendingCustomer(new EventSpotId());

    const entry = waitingList.join(customerId);

    expect(entry.status).toBe(WaitingListEntryStatus.PENDING);
    expect(entry.position).toBe(2);
  });
});
