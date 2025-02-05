import {parse} from 'tldts';

const makeInlinerUrls = ({domain}) => {
    const inlineDomains = [];

    const parsedDomain = parse(domain);

    inlineDomains.push(parsedDomain.domain);

    if (parsedDomain.domain !== parsedDomain.hostname) {
        inlineDomains.push(parsedDomain.hostname);
    }

    const withProtocol = [];

    inlineDomains.forEach((item) => {
        withProtocol.push(`http://${item}`);
        withProtocol.push(`https://${item}`);
    });

    return withProtocol;
};

export {
    makeInlinerUrls
};
