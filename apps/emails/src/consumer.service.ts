import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ConsumerService {
  @RabbitSubscribe({
    exchange: 'amq.direct',
    routingKey: 'PartnerCreatedIntegrationEvent',
    //routingKey: 'events.fullcycle.com/*',
    queue: 'emails',
  })
  handle(msg: { event_name: string; [key: string]: any }) {
    // switch(msg.event_name) {
    //     case 'PartnerCreatedIntegrationEvent':

    //     case 'PartnerUpdatedIntegrationEvent':
    // }
    console.log('ConsumerService.handle', msg);
  }

  @RabbitSubscribe({
    exchange: 'amq.direct',
    routingKey: 'SpotOfferedToWaitingCustomerIntegrationEvent',
    queue: 'emails-spot-offered-to-waiting-customer',
  })
  handleSpotOfferedToWaitingCustomer(msg: {
    event_name: string;
    payload: {
      customer_id: string;
      event_id: string;
      section_id: string;
      spot_id: string;
    };
    [key: string]: any;
  }) {
    console.log('ConsumerService.handleSpotOfferedToWaitingCustomer', {
      event_name: msg.event_name,
      customer_id: msg.payload.customer_id,
      event_id: msg.payload.event_id,
      section_id: msg.payload.section_id,
      spot_id: msg.payload.spot_id,
      occurred_on: msg.occurred_on,
    });
  }
}
