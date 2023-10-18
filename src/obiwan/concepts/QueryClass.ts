import {snakeToPascalCase} from "@/util/util";

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
            if (!linkType || typeof linkType !== 'function' && 'prototype') {
                console.trace(`Invalid object type: ${linkType} either is undefined or isn't a constructor`)
                throw `Invalid object type: ${linkType} either is undefined or isn't a constructor`
            }
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
        if (!this.fks[key]) {
            this.fks[key] = linkRef
        }
    }
}

export abstract class oProperty {
    _parent: oClass;
    _name: string;
    _expression?: string;
    _friendlyName: string;
    __description: string

    constructor(parent: oClass, name: string, friendlyName: string, description: string, expression?: string) {
        this._parent = parent;
        this._name = name;
        this._expression = expression;
        this._friendlyName = friendlyName
        this.__description = description
    }

    abstract getType(): string

    toSQL(): string {
        return `${this._parent.__alias}.${this._name}`;
    }

    isAgg() {
        return false;
    }

    count(): NumberProperty {
        return new CountProperty(this)
    }

    min(): NumberProperty {
        return new MinProperty(this)
    }

    max(): NumberProperty {
        return new MaxProperty(this)
    }

    makeProjectionName() {
        return this._friendlyName
    }
}

export class NumberProperty extends oProperty {
    getType(): string {
        return "number";
    }

    sum(): NumberProperty {
        return new SumProperty(this)
    }

    avg(): NumberProperty {
        return new AvgProperty(this)
    }
}

abstract class NumberAggProperty extends NumberProperty {
    _parentProperty: oProperty
    _sqlFN: string;

    constructor(parentProperty: oProperty, sqlFN: string) {
        super(parentProperty._parent, sqlFN + "_" + parentProperty._name, `${snakeToPascalCase(sqlFN.toLowerCase())} of ${parentProperty._friendlyName}`, `${snakeToPascalCase(sqlFN.toLowerCase())} of ${parentProperty._friendlyName}`, parentProperty._expression);
        this._parentProperty = parentProperty;
        this._sqlFN = sqlFN;
    }

    isAgg(): boolean {
        return true;
    }

    toSQL(): string {
        return `${this._sqlFN}(${this._parentProperty.toSQL()})`;
    }
}

export class CountProperty extends NumberAggProperty {
    constructor(parentProperty: oProperty) {
        super(parentProperty, "COUNT");
    }
}


export class MinProperty extends NumberAggProperty {
    constructor(parentProperty: oProperty) {
        super(parentProperty, "MIN");
    }
}

export class MaxProperty extends NumberAggProperty {
    constructor(parentProperty: oProperty) {
        super(parentProperty, "MAX");
    }
}

export class SumProperty extends NumberAggProperty {
    constructor(parentProperty: oProperty) {
        super(parentProperty, "SUM");
    }
}

export class AvgProperty extends NumberAggProperty {
    constructor(parentProperty: oProperty) {
        super(parentProperty, "AVG");
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

export type DateTimePart = ("year" | "month" | "day" | "hour" | "minute" | "second" | "millisecond")

export class NumericDatePartProperty extends NumberProperty {
    parentProperty: oProperty
    dateTimePart: DateTimePart

    constructor(parentProperty: oProperty, dateTimePart: DateTimePart) {
        super(parentProperty._parent, parentProperty._name, `${snakeToPascalCase(dateTimePart.toLowerCase())} of ${parentProperty._friendlyName}`, `${snakeToPascalCase(dateTimePart.toLowerCase())} of ${parentProperty._friendlyName}`, parentProperty._expression);
        this.parentProperty = parentProperty;
        this.dateTimePart = dateTimePart;
    }

    toSQL(): string {
        return `date_part('${this.dateTimePart}', ${this.parentProperty.toSQL()})`;
    }
}

export class MonthNameProperty extends StringProperty {
    parentProperty: oProperty

    constructor(parentProperty: oProperty) {
        super(parentProperty._parent, parentProperty._name, `Month of ${parentProperty._friendlyName}`, `Month of ${parentProperty._friendlyName}`, parentProperty._expression)
        this.parentProperty = parentProperty;
    }

    toSQL(): string {
        return `TO_CHAR(${this.parentProperty.toSQL()}, 'Month')`
    }
}

export class MonthDatePartProperty extends NumericDatePartProperty {
    asText() {
        return new MonthNameProperty(this.parentProperty)
    }
}

export class DateProperty extends oProperty {
    getType(): string {
        return "date";
    }

    readonly year = new NumericDatePartProperty(this, "year")
    readonly month = new MonthDatePartProperty(this, "month")
    readonly day = new NumericDatePartProperty(this, "day")
}

export class TimeProperty extends oProperty {
    getType(): string {
        return "time";
    }

    readonly hour = new NumericDatePartProperty(this, "hour")
    readonly minute = new NumericDatePartProperty(this, "minute")
    readonly second = new NumericDatePartProperty(this, "second")
    readonly millisecond = new NumericDatePartProperty(this, "millisecond")
}

export class DateTimeProperty extends oProperty {
    getType(): string {
        return "datetime";
    }

    readonly year = new NumericDatePartProperty(this, "year")
    readonly month = new NumericDatePartProperty(this, "month")
    readonly day = new NumericDatePartProperty(this, "day")
    readonly hour = new NumericDatePartProperty(this, "hour")
    readonly minute = new NumericDatePartProperty(this, "minute")
    readonly second = new NumericDatePartProperty(this, "second")
    readonly millisecond = new NumericDatePartProperty(this, "millisecond")

}

export class LinkProperty<T extends typeof oClass> extends oProperty {
    private _type: T;
    private _delegate: InstanceType<T>
    _sourceProperties: string[];

    constructor(parent: oClass, type: () => T, name: string, description: string, sourceProperties: string[], targetProperties: string[]) {
        super(parent, name, name, description, name);
        const objType = type()
        this._type = objType;
        this._sourceProperties = sourceProperties
        const propObj = this as oProperty
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
        super(parent, name, name, `Array of ${parent.__id}`, undefined);
        this._type = type;
    }

    getType(): string {
        return this._type.name + "[]";
    }
}

export class CountStarProp extends NumberProperty {
    toSQL(): string {
        return `COUNT(${this._parent.getAlias()}.*)`;
    }

    isAgg(): boolean {
        return true
    }
}

export abstract class oClass {
    [index: string]: any;

    __alias?: string;
    readonly __sqlContext: SQLContext
    readonly __typeSystemId: string
    readonly __id: string;
    readonly __tableName?: string;
    readonly __constraintQuery: string
    readonly __accessedProperties = new Set<string>()
    readonly __description: string

    __links:Record<string, LinkProperty<any>> = {}

    constructor(sqlContext: SQLContext, typeSystemId: string, id: string, tableName: string | undefined, description: string, constraintQuery: string) {
        this.__sqlContext = sqlContext;
        this.__typeSystemId = typeSystemId
        this.__id = id;
        this.__tableName = tableName
        this.__constraintQuery = constraintQuery
        this.__description = description
    }

    abstract initializeProperties(): void

    getAlias() {
        if (!this.__alias) {
            this.__alias = this.__sqlContext.makeAlias(this)
        }
        return this.__alias
    }

    count() {
        return new CountStarProp(this, "count_start", "Count", "")
    }

    allProperties() {
        const properties: oProperty[] = []
        for (const key of Object.keys(this)) {
            if (!key.startsWith("__")) {
                const prop = this[key]
                if (prop instanceof oProperty) {
                    properties.push(prop)
                } else if (prop instanceof oClass) {
                    properties.push(this.__links[key])
                }
            }
        }

        return properties
    }
}
