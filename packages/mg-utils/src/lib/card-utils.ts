import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

type SerializableNode = {
    readonly nodeType: number;
    readonly nodeName: string;
    readonly nodeValue: string | null;
    readonly nextSibling: SerializableNode | null;
    readonly firstChild: SerializableNode | null;
};

type Card = {
    name: string;
    render: (args: unknown) => SerializableNode;
};

const getCards = () => {
    const {cards} = require('@tryghost/kg-default-cards') as {cards: Card[]};
    return cards;
};

const getCard = (name: string) => {
    return getCards().find(card => card.name === name) as Card;
};

export {getCard};
