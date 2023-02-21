import {join} from 'node:path';
import {URL} from 'node:url';
import {existsSync, mkdirSync} from 'node:fs';

const __dirname = new URL('.', import.meta.url).pathname;
const logPath = join(__dirname, '../', './logs');

let logOpts;

if (process?.env?.NODE_ENV === 'development') {
    if (!existsSync(logPath)){
        mkdirSync(logPath);
    }

    logOpts = {
        name: 'migrateTools',
        mode: 'long',
        level: 'info',
        transports: ['file'],
        path: logPath
    };
} else {
    // TODO: Add production logging
    logOpts = {
        name: 'migrateTools',
        transports: ['stdout']
    };
}

export default logOpts;
