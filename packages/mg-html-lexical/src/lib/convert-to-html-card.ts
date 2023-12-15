const convertToHTMLCard = (htmlString: string) => {
    let structure = {
        root: {
            children: [
                {
                    type: 'html',
                    version: 1,
                    html: htmlString
                }
            ],
            direction: null,
            format: '',
            indent: 0,
            type: 'root',
            version: 1
        }
    };

    return structure;
};

export {
    convertToHTMLCard
};
