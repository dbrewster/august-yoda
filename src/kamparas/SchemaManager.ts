import Ajv, {ValidateFunction} from "ajv";
import {ZodSchema} from "zod";
import {zodToJsonSchema} from "zod-to-json-schema";

class SchemaManager {
    private ajv = new Ajv({

    })

    compileObj<T>(schema: Record<string, any>): ValidateFunction<T> {
        return this.ajv.compile<T>(schema)
    }

    compile<T>(schema: string): ValidateFunction<T> {
        return this.ajv.compile<T>(JSON.parse(schema))
    }

    compileZod<T>(schema: ZodSchema): ValidateFunction<T> {
        return this.ajv.compile<T>(zodToJsonSchema(schema))
    }
}

let _schemaManager: SchemaManager | undefined = undefined

export const getOrCreateSchemaManager = () => {
    if (!_schemaManager) _schemaManager = new SchemaManager()

    return _schemaManager
}
