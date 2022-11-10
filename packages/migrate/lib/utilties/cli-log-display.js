import fs from 'node:fs';
import {ui} from '@tryghost/pretty-cli';

const showLogs = (logFilePath, startTime) => {
    const logData = fs.readFileSync(logFilePath, {encoding: 'utf8'});
    const lines = logData.split('\n');

    lines.forEach((line) => {
        if (line.trim().length > 0) {
            const lineData = JSON.parse(line);

            if (new Date(lineData.time) > startTime) {
                if (lineData.level >= 40 && lineData.level < 50) {
                    ui.log.warn(lineData.message);
                } else if (lineData.level >= 50) {
                    ui.log.error(lineData.message);
                }
            }
        }
    });
};

export {
    showLogs
};
