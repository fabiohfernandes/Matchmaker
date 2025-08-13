// Copyright Epic Games, Inc. All Rights Reserved.
const fs = require('fs');
const path = require('path');

/**
 * Simple logging module for console and file output
 */
class Logger {
    constructor() {
        this.loggers = [];
    }

    log(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        this.loggers.forEach(logger => {
            try {
                logger(logMessage, ...args);
            } catch (error) {
                console.error('Logger error:', error);
            }
        });
    }

    info(message, ...args) {
        this.log('info', message, ...args);
    }

    warn(message, ...args) {
        this.log('warn', message, ...args);
    }

    error(message, ...args) {
        this.log('error', message, ...args);
    }

    debug(message, ...args) {
        this.log('debug', message, ...args);
    }
}

const logger = new Logger();

/**
 * Register console logger
 */
function RegisterConsoleLogger() {
    logger.loggers.push((message, ...args) => {
        console.log(message, ...args);
    });
}

/**
 * Register file logger
 * @param {string} logDirectory - Directory to store log files
 */
function RegisterFileLogger(logDirectory) {
    if (!fs.existsSync(logDirectory)) {
        fs.mkdirSync(logDirectory, { recursive: true });
    }

    const logFile = path.join(logDirectory, `matchmaker-${new Date().toISOString().split('T')[0]}.log`);
    
    logger.loggers.push((message, ...args) => {
        const logLine = message + (args.length > 0 ? ' ' + args.join(' ') : '') + '\n';
        fs.appendFileSync(logFile, logLine);
    });
}

module.exports = {
    RegisterConsoleLogger,
    RegisterFileLogger,
    logger
};