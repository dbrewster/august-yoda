import {SampleFunctions} from "@/praxeum/sample/SampleFunctions";

export const builtinFunctions: Record<string, (v:any) => any> = {
    "SampleFunctions.add": SampleFunctions.add,
    "SampleFunctions.multiply": SampleFunctions.multiply
}
