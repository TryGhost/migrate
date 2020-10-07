module.exports.convertToHTMLCard = (html) => {
    let structure = {
        version: '0.3.1',
        markups: [],
        atoms: [],
        cards: [['html', {cardName: 'html', html: html}]],
        sections: [[10, 0]]
    };

    return structure;
};
