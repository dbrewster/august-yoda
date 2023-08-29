import {
  BaseCallContext,
  BaseItem,
  BaseNameDescriptionItem,
  BaseNameDescriptionOptions,
  ItemValues,
  RunManger
} from "@/yoda/new-query/BaseItem.js";

export interface MapReduceOptions extends BaseNameDescriptionOptions {
  map(input: ItemValues): BaseItem[],

  child?: BaseItem,

  reduce(input: ItemValues[]): ItemValues
}

export class MapReduce extends BaseNameDescriptionItem<MapReduceOptions> {
  async call(runId: string, input: ItemValues, options: BaseCallContext, runManager?: RunManger): Promise<ItemValues> {
    let items = this.props["map"](input);
    runManager?.handleEvent(runId, "onBeforeMapReduce.map", {numChildren: items.length})
    let values = await Promise.all(
      // run the mapper then call 'call' on each of the items returned
      items.map((item, index) => {
        return item._call(runId + ":" + index, input, options, runManager)
      })
    )
    runManager?.handleEvent(runId, "onAfterMapReduce.map", {return: values})
    if (this.props.child) {
      runManager?.handleEvent(runId, "onBeforeMapReduce.child", {numValues: values.length})
      const child = this.props.child
      // if we have a child, give it a chance to map the array of results
      values = await Promise.all(values.map((value, index) => child._call(runId + ":child:" + index, {...input, ...value}, options, runManager)))
      runManager?.handleEvent(runId, "onAfterMapReduce.child", {return: values})
    }
    // Now reduce the whole mess
    runManager?.handleEvent(runId, "onBeforeMapReduce.reduce", {input: values})
    let reduce = this.props.reduce(values);
    runManager?.handleEvent(runId, "onAfterMapReduce.reduce", {return: reduce})
    return reduce
  }
}