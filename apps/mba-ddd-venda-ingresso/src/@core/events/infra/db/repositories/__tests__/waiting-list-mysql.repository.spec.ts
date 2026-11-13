import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  CustomerSchema,
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  PartnerSchema,
  WaitingListEntrySchema,
  WaitingListSchema,
} from '../../schemas';
import { Customer } from '../../../../domain/entities/customer.entity';
import { EventSectionId } from '../../../../domain/entities/event-section';
import { EventId } from '../../../../domain/entities/event.entity';
import { Partner } from '../../../../domain/entities/partner.entity';
import { WaitingList } from '../../../../domain/entities/waiting-list.entity';
import { WaitingListEntryStatus } from '../../../../domain/entities/waiting-list-entry';
import { CustomerMysqlRepository } from '../customer-mysql.repository';
import { EventMysqlRepository } from '../event-mysql.repository';
import { PartnerMysqlRepository } from '../partner-mysql.repository';
import { WaitingListMysqlRepository } from '../waiting-list-mysql.repository';

describe('WaitingList repository', () => {
  let orm: MikroORM<MySqlDriver>;

  beforeEach(async () => {
    orm = await MikroORM.init<MySqlDriver>({
      entities: [
        CustomerSchema,
        PartnerSchema,
        EventSchema,
        EventSectionSchema,
        EventSpotSchema,
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
  });

  afterEach(async () => {
    await orm.close();
  });

  async function createFixture() {
    const em = orm.em.fork();
    const partnerRepo = new PartnerMysqlRepository(em);
    const customerRepo = new CustomerMysqlRepository(em);
    const eventRepo = new EventMysqlRepository(em);

    const partner = Partner.create({ name: 'Partner 1' });
    await partnerRepo.add(partner);

    const event = partner.initEvent({
      name: 'Event 1',
      date: new Date(),
      description: 'Event 1 description',
    });
    event.addSection({
      name: 'Section 1',
      description: 'Section 1 description',
      price: 100,
      total_spots: 1,
    });
    event.addSection({
      name: 'Section 2',
      description: 'Section 2 description',
      price: 50,
      total_spots: 1,
    });
    await eventRepo.add(event);

    const customers = [
      Customer.create({ name: 'Customer 1', cpf: '70375887091' }),
      Customer.create({ name: 'Customer 2', cpf: '59211087074' }),
      Customer.create({ name: 'Customer 3', cpf: '99346413050' }),
    ];
    for (const customer of customers) {
      await customerRepo.add(customer);
    }

    await em.flush();
    await em.clear();

    const [section1, section2] = event.sections.values();
    return { em, event, section1, section2, customers };
  }

  test('deve persistir a fila com as entradas e recarregar na ordem de chegada', async () => {
    const { em, event, section1, customers } = await createFixture();
    const waitingListRepo = new WaitingListMysqlRepository(em);

    const waitingList = WaitingList.create({
      event_id: event.id,
      section_id: section1.id,
    });
    waitingList.join(customers[2].id);
    waitingList.join(customers[0].id);
    waitingList.join(customers[1].id);

    await waitingListRepo.add(waitingList);
    await em.flush();
    await em.clear();

    const waitingListFound = await waitingListRepo.findById(waitingList.id);

    expect(waitingListFound).toBeInstanceOf(WaitingList);
    expect(waitingListFound.id.equals(waitingList.id)).toBe(true);
    expect(waitingListFound.event_id).toBeInstanceOf(EventId);
    expect(waitingListFound.event_id.equals(event.id)).toBe(true);
    expect(waitingListFound.section_id).toBeInstanceOf(EventSectionId);
    expect(waitingListFound.section_id.equals(section1.id)).toBe(true);
    expect(waitingListFound.entries.size).toBe(3);
    expect(
      waitingListFound.entries.map((entry) => entry.customer_id.value),
    ).toEqual([
      customers[2].id.value,
      customers[0].id.value,
      customers[1].id.value,
    ]);
    expect(waitingListFound.entries.map((entry) => entry.position)).toEqual([
      1, 2, 3,
    ]);
    expect(waitingListFound.entries.map((entry) => entry.status)).toEqual([
      WaitingListEntryStatus.PENDING,
      WaitingListEntryStatus.PENDING,
      WaitingListEntryStatus.PENDING,
    ]);
  });

  test('deve persistir a mudança de status e novas entradas de uma fila já salva', async () => {
    const { em, event, section1, customers } = await createFixture();
    const waitingListRepo = new WaitingListMysqlRepository(em);

    const waitingList = WaitingList.create({
      event_id: event.id,
      section_id: section1.id,
    });
    waitingList.join(customers[0].id);
    await waitingListRepo.add(waitingList);
    await em.flush();
    await em.clear();

    const [spot] = section1.spots.values();
    const loaded = await waitingListRepo.findById(waitingList.id);
    loaded.offerSpotToFirstPendingCustomer(spot.id);
    loaded.join(customers[1].id);
    await waitingListRepo.add(loaded);
    await em.flush();
    await em.clear();

    const reloaded = await waitingListRepo.findById(waitingList.id);
    expect(
      reloaded.entries.map((entry) => [entry.customer_id.value, entry.status]),
    ).toEqual([
      [customers[0].id.value, WaitingListEntryStatus.NOTIFIED],
      [customers[1].id.value, WaitingListEntryStatus.PENDING],
    ]);
  });

  test('deve buscar a fila por evento e seção', async () => {
    const { em, event, section1, section2, customers } = await createFixture();
    const waitingListRepo = new WaitingListMysqlRepository(em);

    const waitingList1 = WaitingList.create({
      event_id: event.id,
      section_id: section1.id,
    });
    waitingList1.join(customers[0].id);
    await waitingListRepo.add(waitingList1);
    await em.flush();
    await em.clear();

    const found = await waitingListRepo.findByEventAndSection(
      event.id,
      section1.id,
    );
    expect(found.id.equals(waitingList1.id)).toBe(true);
    expect(found.entries.size).toBe(1);

    const foundByString = await waitingListRepo.findByEventAndSection(
      event.id.value,
      section1.id.value,
    );
    expect(foundByString.id.equals(waitingList1.id)).toBe(true);

    const notFound = await waitingListRepo.findByEventAndSection(
      event.id,
      section2.id,
    );
    expect(notFound).toBeNull();
  });
});
