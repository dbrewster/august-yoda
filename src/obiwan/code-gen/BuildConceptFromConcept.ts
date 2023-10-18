import {MetaConcepts} from "@/obiwan/meta-concepts/MetaConcepts";
import {buildBaseConcept} from "@/obiwan/code-gen/BaseConceptBuilder";
import dotenv from "dotenv";

export const buildConceptFromConcept = async (conceptName: string, knowledgeHubFile: string) => {
  const metaConcept = new MetaConcepts(knowledgeHubFile)
  for (const metaConcept1 of metaConcept.knowledgeHub.concepts) {
    switch (metaConcept1.type) {
      case "BaseConcept":
        await buildBaseConcept(metaConcept1)
        break
    }
  }
}


dotenv.config()
await buildConceptFromConcept("opportunity", "revop_growth")