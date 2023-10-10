import winston, {Logger, format} from "winston"

const {combine, timestamp, printf} = format

const myFormat = printf(({ level, message, timestamp, type, subType, title, identifier }) => {
  return `${timestamp} [${type}:${subType ? subType : ""} ${title}:${identifier}] ${level}: ${message}`;
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

