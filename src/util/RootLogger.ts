import winston, {Logger} from "winston"

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
        winston.format.simple()
    )
})

if (process.env.NODE_ENV === 'production') {
    consoleTransport.level = 'info'
}

rootLogger.add(consoleTransport)

