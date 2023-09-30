import {
  BaseCallContext,
  BaseItem,
  BaseNameDescriptionItem,
  BaseNameDescriptionOptions,
  ItemValues,
  RunManger
} from "@/util/llm/BaseItem";
import {InputValues} from "langchain/schema";


export interface ChainOptions extends BaseNameDescriptionOptions {
  outputValues: string[]
  children: BaseItem[]
}

export class Chain<T extends ChainOptions = ChainOptions> extends BaseNameDescriptionItem<T> {
  async call(runId: string, input: ItemValues, options: BaseCallContext, runManager?: RunManger): Promise<ItemValues> {
    runManager?.handleEvent(runId, "onChainStart", {})
    let runtimeValues = {...input}
    for (const item of this.props.children) {
      const index = this.props.children.indexOf(item);
      const childRunId = runId + ":" + index
      // super important to wait on each item as they need to be called serially and not in parallel
      const output = await item._call(childRunId, {...runtimeValues}, options, runManager)
      runtimeValues = {...runtimeValues, ...output}
    }

    const returnValues =  this.props.outputValues.reduce((ret, outkey) => {
      ret[outkey] = runtimeValues[outkey]
      return ret
    }, {} as InputValues)
    runManager?.handleEvent(runId, "onChainEnd", {return: returnValues})

    return returnValues
  }
}
