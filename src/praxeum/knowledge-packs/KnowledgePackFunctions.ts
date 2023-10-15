import process from "process";
import fs from "fs";
import yaml from "yaml";
import {Resource} from "@/praxeum/DeploymentDescriptor";
import {BuiltinAgent} from "@/kamparas/Agent";
import {nanoid} from "nanoid";
import {defineNewConceptTitle} from "@/praxeum/concept/ConceptFunctions";
import {Concept, getAllConcepts, upsertConcept} from "@/obiwan/concepts/Concept";

export module KnowledgePackFunctions {
    export interface MetaConcept extends Resource {
        knowledge_pack: string
        system: string
        process: string
        name: string
        type: string
        friendlyName: string
        concept_definition: string
    }

    export async function iterateKnowledgePackConceptsAndCreate(args: {
        knowledge_pack_name: string
    }, agent: BuiltinAgent) {
        const conversationId: string = nanoid()
        const path = `${process.env.PRAXEUM_DATA_DIR}`
        const files = fs.readdirSync(path)
        let meta_concepts = files.filter(f => f.endsWith(".yaml")).map(f => `${path}/${f}`).map(path => {
            const contents = fs.readFileSync(path).toString()
            const allDocs = yaml.parseAllDocuments(contents)
            return allDocs.map(doc => {
                // todo -- validate descriptor
                return doc?.toJSON() as Resource
            }).filter(x => x != null && x.kind === "MetaConcept").map(x => x! as MetaConcept)
        }).flat().filter(mc => mc.knowledge_pack == args.knowledge_pack_name)

        const existingConcepts = new Set((await getAllConcepts()).map(x => x.name.toLowerCase()))
        const alreadyExists: string[] = []
        meta_concepts = meta_concepts.filter(mc => {
            if (existingConcepts.has(mc.name.toLowerCase())) {
                alreadyExists.push(mc.name)
                return false
            }
            return true
        })

        agent.logger.info(`Concepts [${alreadyExists.join(",")}] already exist.`)
        agent.logger.info(`Building concepts [${meta_concepts.map(mc => mc.name).join(", ")}]`)
        for (const mc of meta_concepts) {
            agent.logger.info(`Building concept ${mc.name}`)
            const retConcept: any = ((await agent.askForHelp(conversationId, defineNewConceptTitle, nanoid(), {
                system: mc.system,
                process: mc.process,
                concept_name: mc.name,
                concept_definition: mc.concept_definition,
                concept_type: mc.type
            }).promise) as any).concept
            if (!retConcept) {
                agent.logger.error("Could not build concept ", mc.name)
            } else {
                agent.logger.info(`done building concept ${mc.name}`)
                const properties: any[] = retConcept.properties
                const concept: Concept = {
                    name: retConcept.concept_identifier,
                    type: "Concept",
                    description: retConcept.concept_definition,
                    friendlyName: retConcept.friendly_name,
                    base_concept: retConcept.base_concept,
                    constraint_query: retConcept.constraint_query,
                    properties: properties.map(prop => ({
                        name: prop.property_name,
                        friendlyName: prop.friendly_name,
                        description: prop.description,
                        type: prop.type,
                        probability: 0.0,
                        expression: ""
                    }))
                }
                await upsertConcept(concept)
                agent.logger.info(`Stored concept ${concept.name}`)
            }
        }
        return Promise.resolve()
    }
}
