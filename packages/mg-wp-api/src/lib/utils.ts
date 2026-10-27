import {parse} from 'tldts';

const makeInlinerUrls = ({domain}: {domain: string}): string[] => {
    const inlineDomains: string[] = [];

    const parsedDomain = parse(domain);

    inlineDomains.push(parsedDomain.domain!);

    if (parsedDomain.domain !== parsedDomain.hostname) {
        inlineDomains.push(parsedDomain.hostname!);
    }

    const withProtocol: string[] = [];

    inlineDomains.forEach(item => {
        withProtocol.push(`http://${item}`);
        withProtocol.push(`https://${item}`);
    });

    return withProtocol;
};

export {makeInlinerUrls};
