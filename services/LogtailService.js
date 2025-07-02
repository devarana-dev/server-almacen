
const { Logtail } = require("@logtail/node");

require('dotenv').config()

const LOGTAIL_SOURCE_TOKEN = process.env.LOGTAIL_SOURCE_TOKEN
const LOGTAIL_ENDPOINT = process.env.LOGTAIL_ENDPOINT


const logtail = new Logtail(LOGTAIL_SOURCE_TOKEN, {
    endpoint: LOGTAIL_ENDPOINT,
});


const logError = async (err) => {
    await logtail.error(
        typeof err === 'string' ? err : err instanceof Error ? err.message : JSON.stringify(err)
    );
}

const logInfo = async (message) => {
    await logtail.info(message);
}

const logWarning = async (message) => {
    await logtail.warn(message)
}


module.exports = {
    logError,
    logInfo,
    logWarning,
    logtail
}