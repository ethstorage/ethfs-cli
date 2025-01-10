const color = require('colors-cli/safe');
const errorColor = color.red.bold;
const warningColor = color.yellow.bold;
const infoColor = color.blue.bold;
const successColor = color.green.bold;

class Logger {

    static error(message) {
        console.error(errorColor(`❌  ERROR:     ${message}`));
    }

    static warning(message) {
        console.warn(warningColor(`⚠️ WARNING:   ${message}`));
    }

    static info(message) {
        console.info(infoColor(`ℹ️ INFO:      ${message}`));
    }

    static success(message) {
        console.log(successColor(`✅  FINISH:    ${message}`));
    }

    static log(message) {
        console.log(message);
    }
}

module.exports = {
    Logger
}

