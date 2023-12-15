const TextNode = ({node}) => {
    const processChild = function (child, nextChild) {
        let supportedPunctuation = [',', '.', '?', '!', ';', ':', '"', '“', '”', ')'];
        // Add a space after this list of punctuation: colon, comma, period
        let supportedTrailingPunctuation = ['?', '!', ';', '"', '“', '”', '('];
        let delimiterSpaceChar = ' ';

        // If the next node/child starts with one of the punctuation marks above, don't add a space
        if (
            (nextChild &&
            nextChild.content &&
            nextChild.content[0] &&
            supportedPunctuation.includes(nextChild.content[0])) ||
            (child &&
            child.content &&
            child.content.slice(-1) &&
            supportedTrailingPunctuation.includes(child.content.slice(-1)))
        ) {
            delimiterSpaceChar = '';
        }

        let text = `${child.content}${child.link ? '' : delimiterSpaceChar}`;

        if (
            child &&
            child.content &&
            child.content.trim().length === 0 &&
            nextChild &&
            nextChild.content &&
            nextChild.content.trim().length !== 0) {
            text = '<br />';
        }

        if (child.style) {
            if (child.style.underline && !child.link) {
                text = `${delimiterSpaceChar}<u>${text}</u>${delimiterSpaceChar}`;
            }
            if (child.style.italic) {
                text = `<em>${text}</em>${delimiterSpaceChar}`;
            }
            if (child.style.bold) {
                text = `<strong>${text}</strong>${delimiterSpaceChar}`;
            }
        } else {
            text = `${text}${child.link ? '' : delimiterSpaceChar}`;
        }

        if (child.link) {
            text = `${delimiterSpaceChar}<a href="${child.link}">${text}</a>${delimiterSpaceChar}`;
        }

        return text;
    };

    const children = node.children
        .filter(function (child) {
            if (!child.content || child.content === 'FORMAT START' || child.content === 'FORMAT END') {
                return false; // skip
            }
            return true;
        })
        .map((child, i) => {
            let mapped = processChild(child, node.children[i + 1]);
            return mapped;
        });

    if (!children || children.length <= 0) {
        return null;
    }

    let wrapper = null;

    if (node.style === 'TITLE') {
        wrapper = `<h1>${children.join('')}</h1>`;
    } else if (node.style === 'SUBTITLE') {
        wrapper = `<h2>${children.join('')}</h2>`;
    } else if (node.style === 'HEADING_1') {
        wrapper = `<h1>${children.join('')}</h1>`;
    } else if (node.style === 'HEADING_2') {
        wrapper = `<h2>${children.join('')}</h2>`;
    } else if (node.style === 'HEADING_3') {
        wrapper = `<h3>${children.join('')}</h3>`;
    } else if (node.style === 'NORMAL_TEXT') {
        wrapper = `<p>${children.join('')}</p>`;
    } else if (node.style === 'FORMATTED_TEXT') {
        wrapper = `<pre>${children.join('')}</pre>`;
    } else {
        wrapper = `${children.join('')}`;
    }

    return wrapper;
};

export {
    TextNode
};
