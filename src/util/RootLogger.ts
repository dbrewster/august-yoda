import winston, {Logger, format} from "winston"

const {combine, timestamp, printf} = format

const formatAgent = (title: string, identifier: string, maxChars: number = 40) => {
    let thisTitle = title
    const numPadding = maxChars - (title.length + 1 + 21)
    if (numPadding < 0) {
        // need to truncate title
        const left = title.length - ((numPadding-3) * -1 /2)
        thisTitle = title.slice(0, left) + "..." + title.slice(title.length - left)
    }
    return `\u{1D4D0} - ${title}:${identifier}${" ".repeat(numPadding)}`
}

const myFormat = printf(({ level, message, timestamp, type, subType, title, identifier }) => {
    let module = type as string
    if (type === "agent") {
        module = formatAgent(title, identifier)
    }
    let outMessage = message
    if (subType) {
        outMessage = `(${subType}) ${message}`
    }
  return `${timestamp} [${module}] ${level}: ${outMessage}`;
});

export const rootLogger: Logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        // new winston.transports.File({filename: "out.log"}),
    ]
})

const consoleTransport = new winston.transports.Console({
    level: 'info',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.timestamp(),
        myFormat
    )
})

if (process.env.NODE_ENV === 'production') {
    consoleTransport.level = 'info'
}

rootLogger.add(consoleTransport)

