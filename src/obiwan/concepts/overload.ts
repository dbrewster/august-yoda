'use strict';

import {parseModule} from "esprima";
import {VariableDeclaration} from "estree";
import escodegen from "escodegen"
import {oClass} from "@/obiwan/concepts/QueryClass";
import {Query} from "@/obiwan/concepts/Query";
import console from "console";

export const funcNames: Record<string, string> = {
    '+': '__plus',
    '==': '__doubleEqual',
    '===': '__tripleEqual',
    '||': '__logicalOR',
    '&&': '__logicalAND',
    '|': '__bitwiseOR',
    '^': '__bitwiseXOR',
    '&': '__bitwiseAND',
    '!=': '__notEqual',
    '!==': '__notDoubleEqual',
    '<': '__lessThan',
    '>': '__greaterThan',
    '<=': '__lessThanEqual',
    '>=': '__greaterThanEqual',
    'in': '__in',
    'instanceof': '__instanceOf',
    '<<': '__bitwiseLSHIFT',
    '>>': '__bitwiseRSHIFT',
    '>>>': '__zeroFillRSHIFT',
    '-': '__minus',
    '*': '__multiply',
    '%': '__modulus',
    '/': '__divide',
    'u-': '__unaryNegation',
    'u+': '__unaryAddition',
    '~': '__bitwiseNOT',
    '++': '__increment',
    '--': '__decrement',
    '!': '__unaryNOT',
    '+=': '__addAssign',
    '-=': '__minusAssign',
    '*=': '__multiplyAssign',
    '/=': '__divideAssign',
    '%=': '__modulusAssign',
    '<<=': '__leftShiftAssign',
    '>>=': '__rightShiftAssign',
    '>>>=': '__zeroFillRightShiftAssign',
    '&=': '__andAssign',
    '|=': '__orAssign',
    '^=': '__xorAssign'
};

//The AST Walker And Transformer
function visit(statement: Record<string, any>, index: number, program: Record<string, any>) {
    switch (statement.type) {
        case 'VariableDeclaration':
            (statement as VariableDeclaration).declarations.forEach(function (declaration, idx) {
                visit(declaration.init!, idx, program);
            });
            break;
        case 'BinaryExpression':
            if (statement.operator && funcNames[statement.operator]) {
                statement.type = 'ArrayExpression';
                visit(statement.left, index, program);
                visit(statement.right, index, program);
                statement.elements = [statement.left, {
                    type: "Literal",
                    value: statement.operator,
                    raw: `"${statement.operator}"`
                }, statement.right]
                delete statement.left
                delete statement.right
                delete statement.operator
            } else {
                visit(statement.left, index, program);
                visit(statement.right, index, program);
            }
            break;
        case 'LogicalExpression':
            if (statement.operator && funcNames[statement.operator]) {
                statement.type = 'ArrayExpression';
                visit(statement.left, index, program);
                visit(statement.right, index, program);
                statement.elements = [statement.left, {
                    type: "Literal",
                    value: statement.operator,
                    raw: `"${statement.operator}"`
                }, statement.right]
                delete statement.left
                delete statement.right
                delete statement.operator
            } else {
                visit(statement.left, index, program);
                visit(statement.right, index, program);
            }
            break;
        case 'ExpressionStatement':
            visit(statement.expression, index, program);
            break;
        case 'CallExpression':
            statement['arguments'].forEach((argument: Record<string, any>, idx: number) => {
                visit(argument, idx, program);
            });
            visit(statement.callee, index, program);
            break;
        case 'AssignmentExpression':
            if (statement.operator && funcNames[statement.operator]) {
                statement.right = {
                    type: 'CallExpression',
                    callee: {
                        'type': 'MemberExpression',
                        'computed': false,
                        'object': statement.left,
                        'property': {
                            'type': 'Identifier',
                            'name': funcNames[statement.operator]
                        }
                    },
                    arguments: [statement.right]
                };
                statement.operator = '=';

                visit(statement.left, index, program);
                visit(statement.right.arguments[0], index, program);
            } else {
                visit(statement.right, index, program);
            }
            break;
        case 'UnaryExpression':
            if (statement.operator && funcNames[statement.operator]) {
                statement.type = 'CallExpression';
                statement.callee = {
                    'type': 'MemberExpression',
                    'computed': false,
                    'object': statement.argument,
                    'property': {
                        'type': 'Identifier',
                        'name': (statement.operator === '+' || statement.operator === '-') ? funcNames['u' + statement.operator] : funcNames[statement.operator]
                    }
                };
                visit(statement.argument, index, program);
                statement['arguments'] = [];
            } else {
                visit(statement.argument, index, program);
            }
            break;
        case 'UpdateExpression':
            if (statement.operator && funcNames[statement.operator]) {
                statement.type = 'CallExpression';
                statement.callee = {
                    'type': 'MemberExpression',
                    'computed': false,
                    'object': statement.argument,
                    'property': {
                        'type': 'Identifier',
                        'name': funcNames[statement.operator]
                    }
                };
                visit(statement.argument, index, program);
                statement['arguments'] = [];
            }
            break;
        case 'FunctionDeclaration':
        case 'FunctionExpression':
            visit(statement.body, index, program);
            break;
        case 'BlockStatement':
            statement.body.forEach((statement: Record<string, any>) => {
                visit(statement, index, program);
            });
            break;
        case 'ReturnStatement':
            visit(statement.argument, index, program);
            break;
        case 'MemberExpression':
           visit(statement.object, index, program);
           break;
        case 'SwitchStatement':
           statement.cases.forEach((_case: Record<string, any>, idx: number) => {
              visit(_case, idx, program);
           });
        break;
        case 'SwitchCase':
           statement.consequent.forEach((con: Record<string, any>, idx: number) => {
               visit(con, idx, program);
           });
        break;
        case 'ArrowFunctionExpression':
            visit(statement.body, index, program)
        break;
        //We don't need to transform following nodes! Phew!
        case 'Literal':
        case 'Identifier':
            break;
    }
}

//Do the magic

export const parseQuery = (query: string, queryArgs: string[], conceptClasses: Record<string, typeof oClass>) => {
    try {
        const fnBody = `(${queryArgs.join(",")}) => ${query}`
        const fn = parse(fnBody, "Query", ...Object.keys(conceptClasses))
        return fn(Query, ...Object.values(conceptClasses))
    } catch (e) {
        console.error(e)
        throw e
    }
}

export const parse = (funcBody: string, ...args: string[]): any => {
    //Fetch function body
    const body = parseModule(funcBody);
    //Check for AST
    if (!body) throw new Error('Invalid code block! Cannot overload. AST Generation Error.');

    //Build the desired program
    const program = {
        'type': 'Program',
        'body': body.body
    };

    //Transform
    program.body.forEach(function (statement, index) {
        visit(statement, index, program);
    });

    //Build new function args
    args.push("return " + escodegen.generate(program, {
        comment: true,
        format: {
            indent: {
                style: '  '
            }
        }
    }));
    const retFn = new Function(...args);
    // console.log(JSON.stringify(program, null, 4));
    // console.log(retFn.toString());
    return retFn;
};
/*
/!* jshint ignore:start *!/
function defineDefaultProp(constructor, name, val) {
    Object.defineProperty(constructor.prototype, name, {
        enumerable: false,
        writable: true,
        configurable: false,
        value: val
    });
}

//Load defaults
const cons = [Object, Number, String, Function, RegExp];
cons.forEach(function (constructor) {
    defineDefaultProp(constructor, funcNames['+'], function (o) {
        return o + this;
    });
    defineDefaultProp(constructor, funcNames['=='], function (o) {
        return o == this;
    });
    defineDefaultProp(constructor, funcNames['==='], function (o) {
        return o === this;
    });
    defineDefaultProp(constructor, funcNames['||'], function (o) {
        return o || this;
    });
    defineDefaultProp(constructor, funcNames['&&'], function (o) {
        return o && this;
    });
    defineDefaultProp(constructor, funcNames['&'], function (o) {
        return o & this;
    });
    defineDefaultProp(constructor, funcNames['|'], function (o) {
        return o | this;
    });
    defineDefaultProp(constructor, funcNames['^'], function (o) {
        return o ^ this;
    });
    defineDefaultProp(constructor, funcNames['!='], function (o) {
        return o != this;
    });
    defineDefaultProp(constructor, funcNames['!=='], function (o) {
        return o !== this;
    });
    defineDefaultProp(constructor, funcNames['<'], function (o) {
        return o < this;
    });
    defineDefaultProp(constructor, funcNames['>'], function (o) {
        return o > this;
    });
    defineDefaultProp(constructor, funcNames['>>'], function (o) {
        return o >> this;
    });
    defineDefaultProp(constructor, funcNames['<<'], function (o) {
        return o << this;
    });
    defineDefaultProp(constructor, funcNames['>>>'], function (o) {
        return o >>> this;
    });
    defineDefaultProp(constructor, funcNames['<='], function (o) {
        return o <= this;
    });
    defineDefaultProp(constructor, funcNames['>='], function (o) {
        return o >= this;
    });
    defineDefaultProp(constructor, funcNames['in'], function (o) {
        return o in this;
    });
    defineDefaultProp(constructor, funcNames['instanceof'], function (o) {
        return o instanceof this;
    });
    defineDefaultProp(constructor, funcNames['-'], function (o) {
        return o - this;
    });
    defineDefaultProp(constructor, funcNames['*'], function (o) {
        return o * this;
    });
    defineDefaultProp(constructor, funcNames['%'], function (o) {
        return o % this;
    });
    defineDefaultProp(constructor, funcNames['/'], function (o) {
        return o / this;
    });
    defineDefaultProp(constructor, funcNames['u-'], function () {
        return -this;
    });
    defineDefaultProp(constructor, funcNames['u+'], function () {
        return +this;
    });
    defineDefaultProp(constructor, funcNames['~'], function () {
        return ~this;
    });
    defineDefaultProp(constructor, funcNames['++'], function () {
        let val = this;
        ++val;
        return val;
    });
    defineDefaultProp(constructor, funcNames['--'], function () {
        let val = this;
        --val;
        return val;
    });
    defineDefaultProp(constructor, funcNames['!'], function () {
        return !this;
    });
    defineDefaultProp(constructor, funcNames['+='], function (o) {
        return o += this;
    });
    defineDefaultProp(constructor, funcNames['-='], function (o) {
        return o -= this;
    });
    defineDefaultProp(constructor, funcNames['*='], function (o) {
        return o *= this;
    });
    defineDefaultProp(constructor, funcNames['/='], function (o) {
        return o /= this;
    });
    defineDefaultProp(constructor, funcNames['%='], function (o) {
        return o %= this;
    });
    defineDefaultProp(constructor, funcNames['<<='], function (o) {
        return o <<= this;
    });
    defineDefaultProp(constructor, funcNames['>>='], function (o) {
        return o >>= this;
    });
    defineDefaultProp(constructor, funcNames['>>>='], function (o) {
        return o >>>= this;
    });
    defineDefaultProp(constructor, funcNames['&='], function (o) {
        return o &= this;
    });
    defineDefaultProp(constructor, funcNames['|='], function (o) {
        return o |= this;
    });
    defineDefaultProp(constructor, funcNames['^='], function (o) {
        return o ^= this;
    });
});
/!* jshint ignore:end *!/*/

