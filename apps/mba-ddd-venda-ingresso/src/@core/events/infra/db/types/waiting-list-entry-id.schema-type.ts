import { Type, Platform, EntityProperty } from '@mikro-orm/core';
import { WaitingListEntryId } from '../../../domain/entities/waiting-list-entry';

export class WaitingListEntryIdSchemaType extends Type<
  WaitingListEntryId,
  string
> {
  convertToDatabaseValue(
    valueObject: WaitingListEntryId | undefined | null,
    platform: Platform,
  ): string {
    return valueObject instanceof WaitingListEntryId
      ? valueObject.value
      : (valueObject as string);
  }

  //não funciona para relacionamentos
  convertToJSValue(value: string, platform: Platform): WaitingListEntryId {
    return new WaitingListEntryId(value);
  }

  getColumnType(prop: EntityProperty, platform: Platform) {
    return `varchar(36)`;
  }
}
