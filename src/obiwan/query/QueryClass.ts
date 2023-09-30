export interface LinkReference {
  propertyName: string,
  source: string,
  sourceProperties: string[],
  target: string,
  targetProperties: string[]
}

export class SQLContext {
  private aliasMap: Record<string, number> = {}
  private reverseMap: Record<string, oClass> = {}
  fks: Record<string, LinkReference> = {}
  private linkDelegates: Record<string, oClass> = {}

  getOrCreateLinkDelegate<T extends typeof oClass>(parentClassName: string, linkPropName: string, linkType: T): InstanceType<T> {
    const key = `${parentClassName}.${linkPropName}`
    if (!this.linkDelegates[key]) {
      // @ts-ignore
      this.linkDelegates[key] = new linkType(this)
      this.linkDelegates[key].initializeProperties()
    }
    const linkDelegate = this.linkDelegates[key] as InstanceType<T>;
    return new Proxy(linkDelegate, {
      get(obj, prop) {
        // @ts-ignore
        const propValue = obj[prop]
        if (typeof prop === "string" && !prop.toString().startsWith("__")) {
          if (!propValue) {
            console.error(`Invalid property access ${obj.__id}.${prop.toString()}`)
          } else if (propValue instanceof oProperty) {
            obj.__accessedProperties.add(prop)
          }
        }
        return propValue
      }
    })
  }

  makeAlias(obj: oClass) {
    const name = obj.__id
    let num = 0
    if (Object.hasOwn(this.aliasMap, name)) {
      num = this.aliasMap[name] + 1
    }
    this.aliasMap[name] = num
    let alias = `${name}_${num}`;
    this.reverseMap[alias] = obj
    return alias
  }

  getTable(alias: string) {
    return this.reverseMap[alias]
  }

  recordFK(linkRef: LinkReference) {
    let key = `${linkRef.source}.${linkRef.propertyName}`;
    if (this.fks[key]) {
      throw new Error("Duplicate fk:" + key + `[${this.fks[key]},${linkRef.propertyName}`)
    }
    this.fks[key] = linkRef
  }
}

export abstract class oProperty {
  _parent: oClass;
  _name: string;
  _expression?: string;

  constructor(parent: oClass, name: string, expression?: string) {
    this._parent = parent;
    this._name = name;
    this._expression = expression;
  }

  abstract getType(): string

  toSQL(): string {
    return `${this._parent.__alias}.${this._name}`;
  }
}

export class NumberProperty extends oProperty {
  getType(): string {
    return "number";
  }
}

export class StringProperty extends oProperty {
  getType(): string {
    return "string";
  }
}

export class BooleanProperty extends oProperty {
  getType(): string {
    return "boolean";
  }
}

export class LinkProperty<T extends typeof oClass> extends oProperty {
  private _type: T;
  private _delegate: InstanceType<T>

  constructor(parent: oClass, type: () => T, name: string, sourceProperties: string[], targetProperties: string[]) {
    super(parent, name, undefined);
    const objType = type()
    this._type = objType;
    // @ts-ignore
    this._delegate = new Proxy(parent.__sqlContext.getOrCreateLinkDelegate(parent.__id, name, objType), {
      get(obj, prop) {
        const linkRef = {
          propertyName: name,
          source: parent.getAlias(),
          sourceProperties: sourceProperties,
          target: obj.getAlias(),
          targetProperties: targetProperties
        }
        parent.__sqlContext.recordFK(linkRef)
        // @ts-ignore
        return obj[prop]
      }
    })
  }

  getType(): string {
    return this._type.name;
  }

  link() {
    return this._delegate
  }
}

export class ArrayProperty<T extends typeof oClass> extends oProperty {
  private _type: T;

  constructor(parent: oClass, type: T, name: string) {
    super(parent, name);
    this._type = type;
  }

  getType(): string {
    return this._type.name + "[]";
  }
}

export abstract class oClass {
  [index: string]: any;

  __alias?: string;
  readonly __sqlContext: SQLContext
  readonly __id: string;
  readonly __tableName?: string;
  readonly __baseConcepts: string[]
  readonly __accessedProperties = new Set<string>()

  constructor(sqlContext: SQLContext, id: string, tableName: string | undefined, baseConcepts: string[]) {
    this.__sqlContext = sqlContext;
    this.__id = id;
    this.__tableName = tableName
    this.__baseConcepts = baseConcepts
  }

  abstract initializeProperties(): void

  getAlias() {
    if (!this.__alias) {
      this.__alias = this.__sqlContext.makeAlias(this)
    }
    return this.__alias
  }
}
