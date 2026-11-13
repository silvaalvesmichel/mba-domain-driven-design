import { EntityManager, MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  CustomerSchema,
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  OrderSchema,
  PartnerSchema,
  SpotReservationSchema,
  WaitingListEntrySchema,
  WaitingListSchema,
} from '../infra/db/schemas';
import { ApplicationService } from '../../common/application/application.service';
import { DomainEventManager } from '../../common/domain/domain-event-manager';
import { IIntegrationEvent } from '../../common/domain/integration-event';
import { UnitOfWorkMikroOrm } from '../../common/infra/unit-of-work-mikro-orm';
import { Customer } from '../domain/entities/customer.entity';
import { Partner } from '../domain/entities/partner.entity';
import { WaitingListEntryStatus } from '../domain/entities/waiting-list-entry';
import { SpotOfferedToWaitingCustomer } from '../domain/events/domain-events/spot-offered-to-waiting-customer.event';
import { SpotOfferedToWaitingCustomerIntegrationEvent } from '../domain/events/integration-events/spot-offered-to-waiting-customer.int-events';
import { CustomerMysqlRepository } from '../infra/db/repositories/customer-mysql.repository';
import { EventMysqlRepository } from '../infra/db/repositories/event-mysql.repository';
import { OrderMysqlRepository } from '../infra/db/repositories/order-mysql.repository';
import { PartnerMysqlRepository } from '../infra/db/repositories/partner-mysql.repository';
import { SpotReservationMysqlRepository } from '../infra/db/repositories/spot-reservation-mysql.repository';
import { WaitingListMysqlRepository } from '../infra/db/repositories/waiting-list-mysql.repository';
import { NotifyWaitingListHandler } from './handlers/notify-waiting-list.handler';
import { ReleaseSpotHandler } from './handlers/release-spot.handler';
import { OrderService } from './order.service';
import { PaymentGateway } from './payment.gateway';
import { WaitingListService } from './waiting-list.service';

describe('Order cancellation flow (in-process end to end)', () => {
  let orm: MikroORM<MySqlDriver>;
  let em: EntityManager;
  let customerRepo: CustomerMysqlRepository;
  let eventRepo: EventMysqlRepository;
  let orderRepo: OrderMysqlRepository;
  let spotReservationRepo: SpotReservationMysqlRepository;
  let waitingListRepo: WaitingListMysqlRepository;
  let orderService: OrderService;
  let waitingListService: WaitingListService;
  let integrationEvents: IIntegrationEvent[];

  beforeEach(async () => {
    orm = await MikroORM.init<MySqlDriver>({
      entities: [
        CustomerSchema,
        PartnerSchema,
        EventSchema,
        EventSectionSchema,
        EventSpotSchema,
        OrderSchema,
        SpotReservationSchema,
        WaitingListSchema,
        WaitingListEntrySchema,
      ],
      dbName: 'events',
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'root',
      type: 'mysql',
      forceEntityConstructor: true,
    });
    await orm.schema.refreshDatabase();
    em = orm.em.fork();

    customerRepo = new CustomerMysqlRepository(em);
    eventRepo = new EventMysqlRepository(em);
    orderRepo = new OrderMysqlRepository(em);
    spotReservationRepo = new SpotReservationMysqlRepository(em);
    waitingListRepo = new WaitingListMysqlRepository(em);

    const unitOfWork = new UnitOfWorkMikroOrm(em);
    const domainEventManager = new DomainEventManager();
    const applicationService = new ApplicationService(
      unitOfWork,
      domainEventManager,
    );

    orderService = new OrderService(
      orderRepo,
      customerRepo,
      eventRepo,
      spotReservationRepo,
      unitOfWork,
      new PaymentGateway(),
      applicationService,
    );
    waitingListService = new WaitingListService(
      waitingListRepo,
      customerRepo,
      eventRepo,
      applicationService,
    );

    // Same wiring done by EventsModule.onModuleInit
    const releaseSpotHandler = new ReleaseSpotHandler(
      eventRepo,
      spotReservationRepo,
      domainEventManager,
    );
    const notifyWaitingListHandler = new NotifyWaitingListHandler(
      waitingListRepo,
      domainEventManager,
    );
    ReleaseSpotHandler.listensTo().forEach((eventName: string) => {
      domainEventManager.register(eventName, async (event) => {
        await releaseSpotHandler.handle(event);
      });
    });
    NotifyWaitingListHandler.listensTo().forEach((eventName: string) => {
      domainEventManager.register(eventName, async (event) => {
        await notifyWaitingListHandler.handle(event);
      });
    });
    integrationEvents = [];
    domainEventManager.registerForIntegrationEvent(
      SpotOfferedToWaitingCustomer.name,
      async (event) => {
        integrationEvents.push(
          new SpotOfferedToWaitingCustomerIntegrationEvent(event),
        );
      },
    );
  });

  afterEach(async () => {
    await orm.close();
  });

  async function createSoldOutSection() {
    const partnerRepo = new PartnerMysqlRepository(em);
    const partner = Partner.create({ name: 'Partner 1' });
    await partnerRepo.add(partner);

    const customerA = Customer.create({
      name: 'Customer A',
      cpf: '70375887091',
    });
    const customerB = Customer.create({
      name: 'Customer B',
      cpf: '59211087074',
    });
    await customerRepo.add(customerA);
    await customerRepo.add(customerB);

    const event = partner.initEvent({
      name: 'Event 1',
      description: 'Event 1',
      date: new Date(),
    });
    event.addSection({
      name: 'Section 1',
      description: 'Section 1',
      price: 100,
      total_spots: 1,
    });
    event.publishAll();
    await eventRepo.add(event);
    await em.flush();
    em.clear();

    const [section] = event.sections.values();
    const [spot] = section.spots.values();

    const order = await orderService.create({
      event_id: event.id.value,
      section_id: section.id.value,
      spot_id: spot.id.value,
      customer_id: customerA.id.value,
      card_token: 'tok_visa',
    });
    em.clear();

    return { event, section, spot, customerA, customerB, order };
  }

  test('deve liberar o lugar e notificar o primeiro da fila ao cancelar o pedido', async () => {
    const { event, section, spot, customerA, customerB, order } =
      await createSoldOutSection();

    const entry = await waitingListService.join({
      event_id: event.id.value,
      section_id: section.id.value,
      customer_id: customerB.id.value,
    });
    expect(entry.toJSON()).toMatchObject({
      customer_id: customerB.id.value,
      status: 'PENDING',
      position: 1,
    });
    em.clear();

    expect(await spotReservationRepo.findById(spot.id)).not.toBeNull();
    em.clear();

    const cancelledOrder = await orderService.cancel({
      order_id: order.id.value,
    });
    expect(cancelledOrder.toJSON()).toMatchObject({
      id: order.id.value,
      customer_id: customerA.id.value,
      event_spot_id: spot.id.value,
      status: 'CANCELLED',
    });
    em.clear();

    const orderFound = await orderRepo.findById(order.id);
    expect(orderFound.toJSON().status).toBe('CANCELLED');

    const eventFound = await eventRepo.findById(event.id);
    const [sectionFound] = eventFound.sections.values();
    const [spotFound] = sectionFound.spots.values();
    expect(spotFound.id.equals(spot.id)).toBe(true);
    expect(spotFound.is_reserved).toBe(false);

    expect(await spotReservationRepo.findById(spot.id)).toBeNull();

    const entries = await waitingListService.list({
      event_id: event.id.value,
      section_id: section.id.value,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].customer_id.equals(customerB.id)).toBe(true);
    expect(entries[0].status).toBe(WaitingListEntryStatus.NOTIFIED);

    expect(integrationEvents).toHaveLength(1);
    expect(integrationEvents[0].event_name).toBe(
      'SpotOfferedToWaitingCustomerIntegrationEvent',
    );
    expect(integrationEvents[0].payload).toEqual({
      customer_id: customerB.id.value,
      event_id: event.id.value,
      section_id: section.id.value,
      spot_id: spot.id.value,
    });
  });

  test('deve liberar o lugar sem erro quando a seção não tem fila', async () => {
    const { event, section, spot, order } = await createSoldOutSection();

    await orderService.cancel({ order_id: order.id.value });
    em.clear();

    const eventFound = await eventRepo.findById(event.id);
    expect(eventFound.isSectionSoldOut(section.id)).toBe(false);
    expect(await spotReservationRepo.findById(spot.id)).toBeNull();
    expect(
      await waitingListService.list({
        event_id: event.id.value,
        section_id: section.id.value,
      }),
    ).toEqual([]);
    expect(integrationEvents).toHaveLength(0);
  });

  test('não deve cancelar pedido inexistente nem pedido já cancelado', async () => {
    const { order } = await createSoldOutSection();

    await expect(
      orderService.cancel({ order_id: 'f4e7c2f0-3c56-4b1f-9d0e-0a6a3c0f6c11' }),
    ).rejects.toThrow(new Error('Order not found'));

    await orderService.cancel({ order_id: order.id.value });
    em.clear();

    await expect(
      orderService.cancel({ order_id: order.id.value }),
    ).rejects.toThrow(new Error('Order already cancelled'));
  });

  test('deve validar a entrada na fila', async () => {
    const { event, section, customerB, order } = await createSoldOutSection();
    const unknownId = 'f4e7c2f0-3c56-4b1f-9d0e-0a6a3c0f6c11';

    await expect(
      waitingListService.join({
        event_id: event.id.value,
        section_id: section.id.value,
        customer_id: unknownId,
      }),
    ).rejects.toThrow(new Error('Customer not found'));

    await expect(
      waitingListService.join({
        event_id: unknownId,
        section_id: section.id.value,
        customer_id: customerB.id.value,
      }),
    ).rejects.toThrow(new Error('Event not found'));

    await expect(
      waitingListService.join({
        event_id: event.id.value,
        section_id: unknownId,
        customer_id: customerB.id.value,
      }),
    ).rejects.toThrow(new Error('Section not found'));

    await waitingListService.join({
      event_id: event.id.value,
      section_id: section.id.value,
      customer_id: customerB.id.value,
    });
    em.clear();

    await expect(
      waitingListService.join({
        event_id: event.id.value,
        section_id: section.id.value,
        customer_id: customerB.id.value,
      }),
    ).rejects.toThrow(new Error('Customer already in waiting list'));
    em.clear();

    await orderService.cancel({ order_id: order.id.value });
    em.clear();

    await expect(
      waitingListService.join({
        event_id: event.id.value,
        section_id: section.id.value,
        customer_id: customerB.id.value,
      }),
    ).rejects.toThrow(new Error('Section is not sold out'));
  });
});
