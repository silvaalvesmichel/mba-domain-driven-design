import { CustomerId } from '../customer.entity';
import { EventSpotId } from '../event-spot';
import { Order, OrderStatus } from '../order.entity';
import { OrderCancelled } from '../../events/domain-events/order-cancelled.event';

describe('Order Entity Unit Tests', () => {
  function createOrder() {
    return Order.create({
      customer_id: new CustomerId(),
      event_spot_id: new EventSpotId(),
      amount: 100,
    });
  }

  test('deve cancelar um pedido pendente', () => {
    const order = createOrder();
    order.clearEvents();

    order.cancel();

    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(order.toJSON().status).toBe('CANCELLED');
  });

  test('deve cancelar um pedido pago', () => {
    const order = createOrder();
    order.pay();

    order.cancel();

    expect(order.status).toBe(OrderStatus.CANCELLED);
  });

  test('deve registrar OrderCancelled com o lugar do pedido', () => {
    const order = createOrder();
    order.clearEvents();

    order.cancel();

    expect(order.events.size).toBe(1);
    const [event] = order.events as Set<OrderCancelled>;
    expect(event).toBeInstanceOf(OrderCancelled);
    expect(event.aggregate_id.equals(order.id)).toBe(true);
    expect(event.status).toBe(OrderStatus.CANCELLED);
    expect(event.event_spot_id.equals(order.event_spot_id)).toBe(true);
  });

  test('não deve cancelar um pedido já cancelado', () => {
    const order = createOrder();
    order.cancel();
    order.clearEvents();

    expect(() => order.cancel()).toThrow(new Error('Order already cancelled'));
    expect(order.events.size).toBe(0);
  });
});
