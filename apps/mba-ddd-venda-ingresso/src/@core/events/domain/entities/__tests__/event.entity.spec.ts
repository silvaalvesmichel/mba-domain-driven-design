import { EventSpotReleased } from '../../events/domain-events/event-spot-released.event';
import { EventSectionId } from '../event-section';
import { EventSpotId } from '../event-spot';
import { Event } from '../event.entity';
import { PartnerId } from '../partner.entity';
import { initOrm } from './helpers';

describe('Event Entity Unit Tests', () => {
  initOrm();
  it('deve criar um evento', () => {
    const event = Event.create({
      name: 'Evento 1',
      description: 'Descrição do evento 1',
      date: new Date(),
      partner_id: new PartnerId(),
    });

    event.addSection({
      name: 'Sessão 1',
      description: 'Descrição da sessão 1',
      total_spots: 100,
      price: 1000,
    });

    expect(event.sections.size).toBe(1);
    expect(event.total_spots).toBe(100);

    const [section] = event.sections;

    expect(section.spots.size).toBe(100);

    // const spot = EventSpot.create();

    // section.spots.add(spot);

    // console.dir(event.toJSON(), { depth: 10 });

    // não é valido
    // customer = new Customer({
    //   id: '123', new CustomerId() || new CustomerId('')
    //   name: 'João',
    //   cpf: '99346413050',
    // });
  });

  test('deve publicar todos os itens do evento', () => {
    const event = Event.create({
      name: 'Evento 1',
      description: 'Descrição do evento 1',
      date: new Date(),
      partner_id: new PartnerId(),
    });

    event.addSection({
      name: 'Sessão 1',
      description: 'Descrição da sessão 1',
      total_spots: 100,
      price: 1000,
    });

    event.addSection({
      name: 'Sessão 2',
      description: 'Descrição da sessão 2',
      total_spots: 1000,
      price: 50,
    });

    event.publishAll();

    expect(event.is_published).toBe(true);

    const [section1, section2] = event._sections.values();
    expect(section1.is_published).toBe(true);
    expect(section2.is_published).toBe(true);

    [...section1.spots, ...section2.spots].forEach((spot) => {
      expect(spot.is_published).toBe(true);
    });
  });

  function createPublishedEvent() {
    const event = Event.create({
      name: 'Evento 1',
      description: 'Descrição do evento 1',
      date: new Date(),
      partner_id: new PartnerId(),
    });
    event.addSection({
      name: 'Sessão 1',
      description: 'Descrição da sessão 1',
      total_spots: 2,
      price: 1000,
    });
    event.addSection({
      name: 'Sessão 2',
      description: 'Descrição da sessão 2',
      total_spots: 1,
      price: 50,
    });
    event.publishAll();
    return event;
  }

  test('deve liberar um lugar reservado recebendo apenas o id do lugar', () => {
    const event = createPublishedEvent();
    const [, section2] = event.sections.values();
    const [spot] = section2.spots.values();
    event.markSpotAsReserved({ section_id: section2.id, spot_id: spot.id });
    expect(spot.is_reserved).toBe(true);
    event.clearEvents();

    event.markSpotAsAvailable(new EventSpotId(spot.id.value));

    expect(spot.is_reserved).toBe(false);
    expect(
      event.allowReserveSpot({ section_id: section2.id, spot_id: spot.id }),
    ).toBe(true);
  });

  test('deve registrar EventSpotReleased ao liberar um lugar', () => {
    const event = createPublishedEvent();
    const [, section2] = event.sections.values();
    const [spot] = section2.spots.values();
    event.markSpotAsReserved({ section_id: section2.id, spot_id: spot.id });
    event.clearEvents();

    event.markSpotAsAvailable(spot.id);

    expect(event.events.size).toBe(1);
    const [domainEvent] = event.events as Set<EventSpotReleased>;
    expect(domainEvent).toBeInstanceOf(EventSpotReleased);
    expect(domainEvent.aggregate_id.equals(event.id)).toBe(true);
    expect(domainEvent.event_id.equals(event.id)).toBe(true);
    expect(domainEvent.section_id.equals(section2.id)).toBe(true);
    expect(domainEvent.spot_id.equals(spot.id)).toBe(true);
  });

  test('não deve liberar um lugar que não pertence ao evento', () => {
    const event = createPublishedEvent();
    event.clearEvents();

    expect(() => event.markSpotAsAvailable(new EventSpotId())).toThrow(
      new Error('Spot not found'),
    );
    expect(event.events.size).toBe(0);
  });

  test('deve considerar a seção esgotada apenas quando não há lugar disponível', () => {
    const event = createPublishedEvent();
    const [section1] = event.sections.values();
    const [spot1, spot2] = section1.spots.values();

    expect(event.isSectionSoldOut(section1.id)).toBe(false);

    event.markSpotAsReserved({ section_id: section1.id, spot_id: spot1.id });
    expect(event.isSectionSoldOut(section1.id)).toBe(false);

    event.markSpotAsReserved({ section_id: section1.id, spot_id: spot2.id });
    expect(event.isSectionSoldOut(section1.id)).toBe(true);

    event.markSpotAsAvailable(spot2.id);
    expect(event.isSectionSoldOut(section1.id)).toBe(false);

    expect(() => event.isSectionSoldOut(new EventSectionId())).toThrow(
      new Error('Section not found'),
    );
  });
});
