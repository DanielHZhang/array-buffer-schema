import {BufferViewOrSchema, SchemaDefinition} from './types';
import {isObject, isBufferView} from './utils';

export class Schema<T extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * Map that contains references to all Schema instances.
   */
  public static readonly _schemas: Map<string, Schema> = new Map();

  /**
   * Internal byte position reference.
   */
  protected _bytes: number = 0;

  /**
   * Internal id reference.
   */
  protected _id: number;

  /**
   * Internal name reference.
   */
  protected _name: string;

  /**
   * Internal schema definition reference.
   */
  protected _struct: SchemaDefinition<T>;

  /**
   * Get the schema id.
   */
  public get id(): number {
    return this._id;
  }

  /**
   * Get the schema name.
   */
  public get name(): string {
    return this._name;
  }

  /**
   * Get the schema definition.
   */
  public get struct(): SchemaDefinition<T> {
    return this._struct;
  }

  /**
   * Get the number of bytes for a serialized object of this schema.
   */
  public get bytes(): number {
    return this._bytes;
  }

  /**
   * Create a new Schema instance with the specified name and structure.
   * @param name Unique name of the Schema.
   * @param struct SchemaDefinition structure of the Schema.
   */
  public constructor(name: string, struct: SchemaDefinition<T>) {
    this._name = name;
    this._struct = Schema.definition(struct);
    this._id = Schema._schemas.size;

    // Ensure schema with same name does not exist
    if (Schema._schemas.get(name)) {
      throw new Error(`A Schema with the name "${name}" already exists.`);
    } else {
      Schema._schemas.set(name, this);
      if (Schema._schemas.size > 255) {
        throw new Error('The maximum number of Schema instances (255) has been reached.');
      }
    }

    this.calcBytes();
  }

  /**
   * Create a SchemaDefinition without creating a Schema instance.
   * @param obj Object defining the schema.
   */
  public static definition<T>(obj: SchemaDefinition<T>): SchemaDefinition<T> {
    return this.sortStruct(obj);
  }

  /**
   * Get a Schema instance from the static map by its name.
   * @param name Name of the Schema instance.
   */
  public static getInstanceByName(name: string): Schema | undefined {
    return this._schemas.get(name);
  }

  /**
   * Sort and validate the structure of the SchemaDefinition.
   * @param struct The SchemaDefinition structure to be sorted.
   */
  protected static sortStruct<T extends Record<string, any>>(struct: T): T {
    // Find the type of each property of the struct
    const sortedKeys = Object.keys(struct).sort((a, b) => {
      const indexA = this.getSortPriority(struct[a]);
      const indexB = this.getSortPriority(struct[b]);

      // Same type, sort alphabetically by key
      if (indexA === indexB) {
        return a < b ? -1 : 1;
      }
      // Different type, sort by returned index
      else {
        return indexA < indexB ? -1 : 1;
      }
    });

    const sortedStruct: Record<string, any> = {};
    for (const key of sortedKeys) {
      const value = struct[key];
      // Object
      if (isObject(value) && !isBufferView(value)) {
        sortedStruct[key] = this.sortStruct(value);
      }
      // Schema, BufferView, Array
      else {
        sortedStruct[key] = value;
      }
    }
    return sortedStruct as T;
  }

  /**
   * Returns the priority index of the entity based on its type, in order:
   * `BufferView`, `BufferView[]`, `Object`, `Schema`, `Schema[]`
   * @param item Entity to determine sort priority.
   */
  protected static getSortPriority(item: BufferViewOrSchema): number {
    if (isBufferView(item)) {
      return 0;
    }
    if (item instanceof Schema) {
      return 3;
    }
    if (Array.isArray(item)) {
      if (isBufferView(item[0])) {
        return 1;
      }
      if (item[0] instanceof Schema) {
        return 4;
      }
    }
    if (isObject(item)) {
      return 2;
    }
    throw new Error(
      `Unsupported data type in schema definition: ${Array.isArray(item) ? item[0] : item}`
    );
  }

  // public deserialize(view: DataView, bytesRef: {bytes: number}): any {
  //   const data = {};
  //   const bytes = bytesRef.bytes;
  //   for (const key in this._struct) {
  //     if (!Object.prototype.hasOwnProperty.call(this._struct, key)) {
  //       continue;
  //     }
  //     const prop = this._struct[key];
  //     console.log('prop:', prop);
  //     // apply special types options
  //     if (digits) {
  //       value *= Math.pow(10, -specialTypes.digits);
  //       value = parseFloat(value.toFixed(specialTypes.digits));
  //     }
  //     // Handle specialTypes (e.g. x: {type: int16, digits: 2})
  //     // let specialTypes;
  //     // if (prop?.type?._type && prop?.type?._bytes) {
  //     //   specialTypes = prop;
  //     //   prop._type = prop.type._type;
  //     //   prop._bytes = prop.type._bytes;
  //     // }
  //   }
  //   bytesRef.bytes = bytes;
  //   return data;
  // }

  // todo: fix whatever this function is doing
  protected calcBytes(): void {
    const iterate = (obj: Record<any, any>) => {
      for (const property in obj) {
        const type = obj._type;
        const bytes = obj._bytes;

        if (!type && Object.prototype.hasOwnProperty.call(obj, property)) {
          if (typeof obj[property] === 'object') {
            iterate(obj[property]);
          }
        } else {
          if (property !== '_type' && property !== 'type') {
            return;
          }
          if (!bytes) {
            return;
          }

          // we multiply the bytes by the String8 / String16 length.
          if (type === 'String8' || type === 'String16') {
            const length = obj.length || 12;
            this._bytes += bytes * length;
          } else {
            this._bytes += bytes;
          }
        }
      }
    };
    iterate(this._struct);
  }
}
