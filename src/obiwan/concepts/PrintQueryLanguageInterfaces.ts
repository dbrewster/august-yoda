const BasePropertyType =
`/*
  Base type for all properties in the system. The generic type 'T' represents the type of the property, either string, number, boolean, date, time, or datetime 
*/
interface Property<T> {{
  // number of input rows for which the value of expression is not null.
  count(): number
  // minimum value of expression across all non-null input values.
  min(): number
  // maximum value of expression across all non-null input values
  max(): number  
}}
`

const StringType =
`/*
    The String type represents a queryable property that is of type 'string' 
*/
interface String Property<string> {{
}}`

const NumberType =
`/*
    The Number type represents a queryable property that is of type 'number' 
*/
interface Number : Property<number> {{
  //  the average (arithmetic mean) of all non-null input values 
  avg(): number
  // sum of expression across all non-null input values
  sum(): number
}}`

const BooleanType =
`/*
    The Boolean type represents a queryable property that is of type 'boolean' 
*/
interface Boolean : Property<boolean> {{
}}`

const MonthType =
`/*
    The Month type represents the numeric value of the month
*/
interface Month : Number {{
  // Returns the month as it's text representation in english.  I.e. January, February, ...
  asText(): string
}}`

const DateType =
`/*
    The Date type represents a queryable property that is of type 'date'.
*/
interface Date : Property<date> {{
  // the year of the date as a 4 digit number
  year(): Number
  // the month of the year
  month(): Month
  // the day of the year
  day(): Number  
}}`

const TimeType =
`/*
    The Time type represents a queryable property that is of type 'time'.
*/
interface Time : Property<time> {{
  // the hour of the day
  hour(): Number
  // the minute of the hour
  minute(): Number
  // the second of the minute
  second(): Number  
  // the millisecond of the minute
  millisecond(): Number  
}}`

const DateTimeType =
`/*
    The DateTime type represents a queryable property that is of type 'datetime'.
*/
interface DateTime : Property<datetime> {{
  // the year of the date as a 4 digit number
  year(): Number
  // the month of the year
  month(): Month
  // the day of the year
  day(): Number  
  // the hour of the day
  hour(): Number
  // the minute of the hour
  minute(): Number
  // the second of the minute
  second(): Number  
  // the millisecond of the minute
  millisecond(): Number  
}}`

const DerivedFrom =
`
/*
  Indicates that this interface derives from the the specified parameter type.
  Derived types have a mapping to the specified type through a query represented by the __constraint_query member of the interface.
  
  params:
    T: The type this type derives from
*/
interface DerivedFrom<T extends Queryable> {{
}}
`

const Queryable =
`/*
  Queryable is the base class for all queryable interfaces.
*/
interface Queryable {{
}}`

const QueryString =
`type BinaryOperand = ("+" | "-" | "*" | "/" | "&&" | "||" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "%")
type UnaryOperand = ("!")

type BinaryOperator = [Property, BinaryOperand, Property]
type UnaryOperator = [UnaryOperand, Property]

type OrderByProperty = [Property, ("ASCENDING" | "DESCENDING")]

/*
Class that drives the search. All search operations are derived from this class. 
This class is instantiated with the driving table of the query. The driving table should ALWAYS be the specified driving table  
 */
class Query {{
  /*
    Generates the where clause for the search. The where clause filters the results by the expressions.
    
    fn: A lambda expression where the input to the expression is an object of the driving table query type. The return type is the result of an expression
  */
  where(fn: (o: Queryable) => (BinaryOperator | UnaryOperator)): Query

  /*
    Specifies the return values for the search. The return values are used to display the results to the user.
  */
  return(fn: (o: Queryable) => Property[]): Query 

  /*
    Orders the results by the given expression
  */
  orderBy(fn: (o: Queryable) => OrderByProperty[]): Query 

  /*
    Groups the results by the specified properties. ALL properties in the return or the orderBy clause MUST either be in the groupBy or be an aggregate function.
  */
  groupBy(fn: (o: Queryable) => Property[]): Query
  
  /*
    Limits the results by the specified number of rows
  */
  limit(numRows: number)
}}`

export const printQueryTypes = () => {
    return `
${BasePropertyType}
${StringType}
${NumberType}
${BooleanType}
${MonthType}
${DateType}
${TimeType}
${DateTimeType}

${Queryable}
${DerivedFrom}
${QueryString}
`
}

export const printExampleSearches = () => {
    return `
Query(SomeObject)
.where((o) => o.value = 123 && o.otherValue = "here")
.groupBy((o) => [o.date.year, o.date.month.asText()])
.orderBy((o) => [o.date.year])
.return((o) => [o.date.year, o.date.month.asText(), o.value.sum(), o.otherValue.max()])
`
}
