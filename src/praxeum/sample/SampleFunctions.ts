interface MathArgs {
    a: number,
    b: number
}

interface TestArgs {
    instructions: string,
}

export module SampleFunctions {
    export function add(args: MathArgs) {
        return {x: args.a + args.b}
    }

    export function multiply(args: MathArgs) {
        return {x: args.a * args.b}
    }

    export function test(args: TestArgs) {
        if (args.instructions === "raise") {
            throw Error("here is some error")
        }
        return {response: "some response"}
    }

    export async function asyncTest(args: TestArgs) {
        return test(args)
    }
}