import process from "process";
import fs from "fs";
import yaml from "yaml";
import {Resource} from "@/praxeum/server/DeploymentDescriptor";
import {defineNewConceptTitle} from "@/praxeum/concept/ConceptFunctions";
import {Concept, getAllConcepts, upsertConcept} from "@/obiwan/concepts/Concept";
import {CodeAgent, CodeAgentOptions} from "@/kamparas/CodeAgent";
import {z} from "zod";
import {HelpResponse, NewTaskInstruction} from "@/kamparas/Environment";
import {getOrCreateSchemaManager} from "@/kamparas/SchemaManager";

interface BuildKnowledgePackCallContext {
    requestId: string,
    building_concept_name: string,
    knowledge_pack_name: string,
    concepts_already_built: string[],
    concepts_built: string[],
    concepts_errored: string[]
}

export interface MetaConcept extends Resource {
    knowledge_pack: string
    system: string
    process: string
    name: string
    type: string
    friendlyName: string
    concept_definition: string
}

export class BuildKnowledgePack extends CodeAgent {
    constructor(options: CodeAgentOptions) {
        super({
            ...options,
            identifier: "alpha",
            job_description: "Builds all of the concepts for a knowledge pack",
            input_schema: getOrCreateSchemaManager().compileZod(z.object({
                knowledge_pack_name: z.string().describe("The name of the knowledge pack to build")
            })),
            answer_schema: getOrCreateSchemaManager().compileZod(z.object({
                concepts_built: z.array(z.string().describe("The name of the meta concept")).describe("An array of concept names that were built"),
                concepts_errored: z.array(z.string().describe("The name of the meta concept")).describe("An array of concept names that had errors")
            })),
        });
    }

    async exec(instruction: NewTaskInstruction, conversationId: string): Promise<void> {
        const args = instruction.input
        const {meta_concepts, alreadyExists} = await this.getContext(args.knowledge_pack_name)
        this.logger.info(`Concepts [${alreadyExists.join(",")}] already exist.`)
        this.logger.info(`Building concepts [${meta_concepts.map(mc => mc.name).join(", ")}]`)
        const callContext = {
            requestId: instruction.request_id,
            building_concept_name: "",
            knowledge_pack_name: args.knowledge_pack_name,
            concepts_already_built: alreadyExists,
            concepts_built: [],
            concepts_errored: []
        }

        this.buildNextOrAnswer(meta_concepts.length == 0 ? undefined : meta_concepts[0], callContext, conversationId)
    }

    private buildConcept(mc: MetaConcept, callContext: BuildKnowledgePackCallContext, conversationId: string) {
        this.logger.info(`Building concept ${mc.name}`)
        // noinspection ES6MissingAwait,JSIgnoredPromiseFromCall
        this.askForHelp(conversationId, defineNewConceptTitle, {
            system: mc.system,
            process: mc.process,
            concept_name: mc.name,
            concept_definition: mc.concept_definition,
            concept_type: mc.type
        }, callContext)
    }

    async processHelpResponse(response: HelpResponse, inCallContext: any): Promise<void> {
        const callContext = inCallContext as BuildKnowledgePackCallContext
        const knowledge_pack_name = callContext.knowledge_pack_name as string
        const conversationId = response.conversation_id

        const retConcept = (response.response as any).concept

        if (!retConcept) {
            this.logger.error("Could not build concept ", callContext.building_concept_name)
            callContext.concepts_errored.push(callContext.building_concept_name)
        } else {
            this.logger.info(`done building concept ${callContext.building_concept_name}`)
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
            this.logger.info(`Stored concept ${concept.name}`)
        }

        const {meta_concepts} = await this.getContext(knowledge_pack_name)
        this.buildNextOrAnswer(meta_concepts.length == 0 ? undefined : meta_concepts[0], callContext, conversationId)
    }

    private buildNextOrAnswer(mc: MetaConcept | undefined, callContext: BuildKnowledgePackCallContext, conversationId: string): void {
        if (mc) {
            this.buildConcept(mc, {
                ...callContext,
                building_concept_name: mc.name
            }, conversationId);
        } else {
            const answer = {
                concepts_already_built: callContext.concepts_already_built,
                concepts_built: callContext.concepts_built,
                concepts_errored: callContext.concepts_errored
            }
            // noinspection JSIgnoredPromiseFromCall
            this.doAnswer(conversationId, callContext.requestId, answer)
        }
    }

    async getContext(knowledge_pack_name: string) {
        const path = `${process.env.PRAXEUM_DATA_DIR}`
        const files = fs.readdirSync(path)
        let meta_concepts = files.filter(f => f.endsWith(".yaml")).map(f => `${path}/${f}`).map(path => {
            const contents = fs.readFileSync(path).toString()
            const allDocs = yaml.parseAllDocuments(contents)
            return allDocs.map(doc => {
                // todo -- validate descriptor
                return doc?.toJSON() as Resource
            }).filter(x => x != null && x.kind === "MetaConcept").map(x => x! as MetaConcept)
        }).flat().filter(mc => mc.knowledge_pack == knowledge_pack_name)

        const existingConcepts = new Set((await getAllConcepts()).map(x => x.name.toLowerCase()))
        const alreadyExists: string[] = []
        meta_concepts = meta_concepts.filter(mc => {
            if (existingConcepts.has(mc.name.toLowerCase())) {
                alreadyExists.push(mc.name)
                return false
            }
            return true
        })
        return {meta_concepts, alreadyExists};
    }

}
