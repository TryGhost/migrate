const fs = require('fs-extra');
const process = require('./lib/process');
const xml2js = require('xml2js');

function colonToUnderscore(name){
    return name.replace(':', '_');
}

module.exports = async (ctx) => {
    let parser = new xml2js.Parser({
        attrkey: 'attrs',
        charkey: 'value',
        tagNameProcessors: [colonToUnderscore]
    });

    let xml = fs.readFileSync(ctx.options.pathToFile, 'utf8');
    let input = await parser.parseStringPromise(xml);

    // process xml file (posts, pages, users, tags)
    const processed = await process.all(input, ctx);

    return processed;
};
