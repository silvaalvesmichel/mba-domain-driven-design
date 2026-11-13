import { IRepository } from '../../../common/domain/repository-interface';
import { EventSpotId } from '../entities/event-spot';
import { Event } from '../entities/event.entity';

export interface IEventRepository extends IRepository<Event> {
  findByEventSpotId(spot_id: string | EventSpotId): Promise<Event | null>;
}
