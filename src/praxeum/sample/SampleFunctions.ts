interface MathArgs {
    a: number,
    b: number
}

export module SampleFunctions {
    export function add(args: MathArgs) {
        return {x: args.a + args.b}
    }

    export function multiply(args: MathArgs) {
        return {x: args.a * args.b}
    }
}