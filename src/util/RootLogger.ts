import winston, {format, Logger} from "winston"

const {printf} = format

const formatAgent = (type: string, title: string, identifier: string, conversation_id: string, maxChars: number = 60) => {
    let thisTitle = title
    let numPadding = maxChars - (title.length + 1 + 20)
    if (numPadding < 0) {
        // need to truncate title
        const left = title.length - ((Math.abs(numPadding)-3) * -1 /2)
        thisTitle = title.slice(0, left) + "..." + title.slice(title.length - left)
        numPadding = 0
    }

    let agentChar = ""
    switch (type) {
        case "agent":
            agentChar = "\u{1D4D0}"
            break
        case "skilledWorker":
            agentChar = "\u{1D4E2}"
            break
        case "builtinWorker":
            agentChar = "\u{1D4D1}"
            break
        case "manager":
            agentChar = "\u{1D4DC}"
            break
        case "qaManager":
            agentChar = "\u{1D4E0}"
            break
        default:
            break
    }

    const thisTaskId = conversation_id || " ".repeat(21)

    return `${agentChar} - ${thisTitle}:${identifier}:${thisTaskId}${" ".repeat(numPadding)}`
}

const myFormat = printf(({ level, message, timestamp, type, subType, title, identifier, conversation_id, stack}) => {
    let module = type as string
    switch (type) {
        case "agent":
        case "skilledWorker":
        case "builtinWorker":
        case "manager":
        case "qaManager":
            module = formatAgent(type, title, identifier, conversation_id)
    }
    let outMessage = message
    if (subType) {
        outMessage = `(${subType}) ${message}`
    }
    if (stack) {
        outMessage = outMessage + "\n" + stack
    }
  return `${timestamp} [${module}] ${level}: ${outMessage}`;
});

const consoleTransport = new winston.transports.Console({
    level: 'info',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.timestamp(),
        myFormat
    )
})

export const rootLogger: Logger = winston.createLogger({
    // levels: winston.config.syslog.levels,
    level: 'info',
    format: winston.format.json(),
    transports: [
        consoleTransport
    ]
})

if (process.env.NODE_ENV === 'production') {
    consoleTransport.level = 'info'
}


export function setRootLoggerLevel(level: string) {
    consoleTransport.level = level.trim()
}