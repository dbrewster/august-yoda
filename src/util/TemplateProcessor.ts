import Handlebars from "handlebars"

Handlebars.registerHelper("helperMissing", (...args: any[]) => {
    if (args.length == 1) {
        return `{{${args[0].name}}}`
    } else {
        return ""
    }
})

export namespace TemplateProcessor {
    export function process(template: string, input: Record<string, any>) {
        const compiledTemplate = Handlebars.compile(template, {noEscape:true})
        return compiledTemplate(input)
    }
}
