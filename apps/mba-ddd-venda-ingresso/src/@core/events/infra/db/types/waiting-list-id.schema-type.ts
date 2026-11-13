import { Type, Platform, EntityProperty } from '@mikro-orm/core';
import { WaitingListId } from '../../../domain/entities/waiting-list.entity';

export class WaitingListIdSchemaType extends Type<WaitingListId, string> {
  convertToDatabaseValue(
    valueObject: WaitingListId | undefined | null,
    platform: Platform,
  ): string {
    return valueObject instanceof WaitingListId
      ? valueObject.value
      : (valueObject as string);
  }

  //não funciona para relacionamentos
  convertToJSValue(value: string, platform: Platform): WaitingListId {
    return new WaitingListId(value);
  }

  getColumnType(prop: EntityProperty, platform: Platform) {
    return `varchar(36)`;
  }
}
