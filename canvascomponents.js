displayLoadedAnimation();

// prevent multiple initializations
if (window.CANVAS_COMPONENTS_LOADED)
    throw new Error("Already loaded CanvasComponents.");
window.CANVAS_COMPONENTS_LOADED = true;

let components = {
    /*${CANVAS_COMPONENTS}*/
};

const debug = false;

/**
 * @param {object} json
 */
function onXhrRequest(json) {
    if (json.message) {
        try {
            // if an error occurs now, we don't want to send the request.
            const { message } = json;
            console.info(
                "CanvasComponents: Transforming request with the message: ",
                message
            );

            const lexed = lex(message);
            const parsed = parse(lexed);
            console.info("Parsed message as: ", parsed);
            let cssManager = new CssManager();
            const transpiledHtml = transpileStatements(parsed, cssManager);
            const transpiledCss =
                "<style>" + cssManager.getCssString() + "</style>";
            const transpiledOutput = transpiledCss + transpiledHtml;
            console.log(
                "%cOutput: " + transpiledOutput,
                "color: gray; font-family: monospace; font-size: 0.75em;"
            );
            console.info(
                "%c\u2705 Successfully completed transpilation.",
                "color: green; font-weight: bold;"
            );
            json.message = transpiledOutput;

            // we have made an update to the json, return it
            return json;
        } catch (e) {
            console.error(e);
            window.prompt(
                "An error occurred. Press ctrl+c to copy the text in this prompt now, or you will lose what you entered on the page FOREVER. " +
                    e,
                message
            );
            return;
        }
    }

    // no updates necessary, probably a normal HTTP request
    return null;
}

/**
 * Transpile all statements into a single string
 * @param {object[]} statements
 * @param {CssManager} cssManager
 * @returns {string}
 */
function transpileStatements(statements, cssManager) {
    let result = "";
    for (const statement of statements) {
        result += transpileOnce(statement, cssManager);
    }
    return result;
}

/**
 * Transpile a statement into a string
 * @param {object} statement
 * @param {CssManager} cssManager
 * @returns {string}
 */
function transpileOnce(statement, cssManager) {
    let result = "";
    const { type, value } = statement;
    switch (type) {
        case "str": {
            result += value;
            break;
        }
        case "component": {
            const { name, args } = value;
            cssManager.includeCss(name);
            const { usage, arguments: realArgs, html } = components[name];
            if (args.length !== realArgs.length)
                throw new Error(
                    `Expected ${realArgs.length} arguments but only found ${args.length} in the '${name}' component.\n\nExample usage: ${usage}`
                );
            let htmlAfterVariableExpansion = html;
            const argValues = [];
            for (var i = 0; i < realArgs.length; i++) {
                // TODO: typechecking
                const argName = realArgs[i][0];
                const argValue = args[i];
                const transpiledArgValue = transpileStatements(
                    argValue,
                    cssManager
                );
                argValues.push([argName, transpiledArgValue]);
                htmlAfterVariableExpansion =
                    htmlAfterVariableExpansion.replaceAll(
                        "${" + argName + "}",
                        transpiledArgValue
                    );
            }

            // expand exec statements
            const execs = /\${eval:(.+)}/g;
            const allVariablesStr = argValues.reduce(
                (str, [argName, argVal]) =>
                    `${str}\nconst ${argName} = ${JSON.stringify(argVal)};`,
                ""
            );
            htmlAfterVariableExpansion = htmlAfterVariableExpansion.replaceAll(
                execs,
                (_match, code) => {
                    const codeWithVariables = allVariablesStr + code;
                    console.log(codeWithVariables);
                    return window.eval(codeWithVariables);
                }
            );

            result += htmlAfterVariableExpansion;
            break;
        }
    }
    return result;
}

class CssManager {
    constructor() {
        this._includedCss = new Set();
        this._cssString = "";
    }
    /**
     * @param {string} name
     */
    includeCss(name) {
        // include if not already included
        if (!this._includedCss.has(name)) {
            this._includedCss.add(name);
            this._cssString += components[name].style;
        }
    }
    getCssString() {
        return this._cssString;
    }
}

/**
 * * PARSER/LEXER
 * This code handles parsing of the input. Currently it is extremely complex and hard to follow.
 * It should probably be completely rewritten if requirements change.
 */
/**
 * @param {WrappedLex} lex
 */
function parse(lex, expectEnd) {
    let statements = [];
    while (lex.hasNext()) {
        const { type, value } = lex.take()[0];
        switch (type) {
            case "begin_component": {
                const name = parseStr(lex).toLowerCase();
                if (name.match(/\W/))
                    throw new Error(
                        `Parse Error: Component name cannot include invalid characters: '${name}'`
                    );
                if (!components[name])
                    throw new Error(`Parse Error: Unknown component '${name}'`);
                const args = [];
                let nextLex = lex.take()[0];
                while (nextLex.type !== "end_component") {
                    if (nextLex.type === "next_arg") {
                        const value = parse(lex, true);
                        args.push(value);
                        nextLex = lex.take()[0];
                    } else {
                        throw new Error(
                            `Parse Error: Expected '][' or ']!' after component '${name}', found '${JSON.stringify(
                                nextLex
                            )}'`
                        );
                    }
                }
                statements.push({ type: "component", value: { name, args } });
                break;
            }
            case "next_arg":
            case "end_component":
                if (expectEnd) {
                    // FIXME: better solution?
                    lex._index -= 1;
                    return statements;
                }
            // otherwise fall through as str
            case "char": {
                statements.push({ type: "str", value: value + parseStr(lex) });
                break;
            }
        }
    }
    return statements;
}

/**
 * @param {WrappedLex} lex
 */
function parseStr(lex) {
    let str = "";
    while (lex.hasNext() && lex.peek()[0].type == "char") {
        str += lex.take()[0].value;
    }
    return str;
}

/**
 * @param {WrappedLex} lex
 */
function parseArgs(lex) {}

/**
 * @param {string} string
 */
function lex(string) {
    let str = new Str(string);
    let finalLex = [];

    let counter = 0;
    while (str.hasNext()) {
        const oneLex = lexOnce(str);
        if (oneLex) {
            finalLex.push(oneLex);
        }
        counter++;
        if (counter > 100_000) {
            throw "Lexing failed: Looped too many times";
        }
    }

    return new WrappedLex(finalLex);
}

/**
 * @param {Str} str
 */
function lexOnce(str) {
    const char = str.take();
    switch (char) {
        case "!": {
            if (str.peek() == "[") {
                str.take();
                return { type: "begin_component" };
            } else {
                return { type: "char", value: char };
            }
        }
        case "]": {
            if (str.peek() == "[") {
                str.take();
                return { type: "next_arg", value: "][" };
            } else if (str.peek() == "!") {
                str.take();
                return { type: "end_component", value: "]!" };
            } else {
                return { type: "char", value: char };
            }
        }
        default: {
            return { type: "char", value: char };
        }
    }
}

// lots of parser code from https://github.com/UltimatePro-Grammer/spaghetti-script
class Stack {
    constructor() {
        this._index = 0;
    }
    peek(amount = 1) {
        return this._get(this._index, amount);
    }
    take(amount = 1) {
        if (this._index + amount > this.getLength()) {
            throw new Error("Parse Error: Expected more text");
        }
        const arr = this._get(this._index, amount);
        this._index += amount;
        return arr;
    }
    hasNext() {
        return this._index < this.getLength();
    }
    getIndex() {
        return this._index;
    }
}

class WrappedLex extends Stack {
    constructor(lexArr) {
        super();
        this._arr = lexArr;
    }
    _get(start, amount) {
        return this._arr.slice(start, start + amount);
    }
    getLength() {
        return this._arr.length;
    }
}

class Str extends Stack {
    constructor(str) {
        super();
        this._str = str;
    }
    _get(start, amount) {
        return this._str.substring(start, start + amount);
    }
    getLength() {
        return this._str.length;
    }

    isNextNumber() {
        if (this.hasNext()) {
            // can't use the Number() constructor because it is often wrong (eg Number(" ") == 0)
            return /[0-9]+/.test(this.peek());
        }
        return false;
    }
    takeFollowingNumber(errorMsg, options = { allowNegative: false }) {
        if (
            !this.isNextNumber() &&
            !(options.allowNegative && this.peek() == "-")
        ) {
            throw errorMsg;
        }
        let num = this.take();
        while (this.isNextNumber()) {
            num += this.take();
        }
        return num;
    }
}

/**
 * * HTTP REQUEST INJECTION
 * To edit the HTML message content, we change it right before
 * the HTTP request is sent. To do this, we inject into
 * XMLHttpRequest.send, which is how Canvas sends HTTP messages.
 */
let oldFetch = window.fetch;
window.fetch = function (...arguments) {
    debugHttpRequest("fetch", arguments);
    return oldFetch.call(this, ...arguments);
};

let oldXMLHttpSend = window.XMLHttpRequest.prototype.send;
window.XMLHttpRequest.prototype.send = function (...arguments) {
    debugHttpRequest("xhr", arguments);
    const body = arguments[0];
    if (body) {
        let json;
        try {
            json = JSON.parse(body);

            const possibleNewValue = onXhrRequest(json);
            if (possibleNewValue) {
                arguments[0] = JSON.stringify(possibleNewValue);
            }
        } catch (e) {
            // ignore, they are sending non-json
        }
    }
    return oldXMLHttpSend.call(this, ...arguments);
};

function debugHttpRequest(msg, arguments) {
    if (debug) {
        let data = "";
        for (const ind in arguments) {
            const arg = arguments[ind];
            let str;
            if (typeof arg === "string") {
                str = "(str) " + arg;
            } else {
                str = JSON.stringify(arg, null, 2);
            }
            data += "arg " + ind + ": " + str + "\n\n";
        }
        alert(msg + ": " + data);
    }
}

function displayLoadedAnimation() {
    const el = document.createElement("div");
    el.id = "canvas-components-loaded";
    el.innerHTML =
        "<style>#canvas-components-loaded {position: fixed; z-index: 999999999; left: 50%; top: 50%; transform: translate(-50%, -50%); animation: ccl 0.65s ease-out; pointer-events: none; animation-fill-mode: forwards;} @keyframes ccl { from { font-size: 0px; opacity: 1; } to { font-size: 100vw; opacity: 0; }}</style>\uD83C\uDF47";
    document.body.appendChild(el);
    setTimeout(() => {
        el.remove();
    }, 1100);
}

console.log("%cLoaded CanvasComponents successfully!", "color: rebeccapurple;");
