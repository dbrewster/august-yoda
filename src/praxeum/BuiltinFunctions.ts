import {SampleFunctions} from "@/praxeum/sample/SampleFunctions";
import {ConceptFunctions} from "@/praxeum/concept/ConceptFunctions";

// todo, builtin Functions should not need interfaces for each function, calls should instead explode the args
export const builtinFunctions: Record<string, (v:any) => any> = {
    "SampleFunctions.add": SampleFunctions.add,
    "SampleFunctions.multiply": SampleFunctions.multiply,

    "ConceptFunctions.list": ConceptFunctions.listAll,
    "ConceptFunctions.getDetails": ConceptFunctions.getDetails,
    // todo, this should just get the sample rows for a list of concepts
    "ConceptFunctions.getDetailsWithSample": ConceptFunctions.getDetailWithSample,
    "ConceptFunctions.getInterfaces": ConceptFunctions.getInterfaces,


}
