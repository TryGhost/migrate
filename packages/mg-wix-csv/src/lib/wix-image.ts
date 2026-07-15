const WIX_STATIC_MEDIA_URL = 'https://static.wixstatic.com/media';

type WixImageParts = {
    id: string;
    filename: string;
};

const buildWixStaticUrl = ({id}: WixImageParts) => {
    const encodedId = encodeURI(id);

    return `${WIX_STATIC_MEDIA_URL}/${encodedId}`;
};

const parseWixImageUri = (value: string) => {
    const match = value.match(/^wix:image:\/\/v1\/([^/]+)\/([^#]+)(?:#(.*))?$/);

    if (!match) {
        return null;
    }

    const params = new URLSearchParams(match[3] || '');
    let id;
    let filename;

    try {
        id = decodeURIComponent(match[1]);
        filename = decodeURIComponent(match[2]);
    } catch {
        return null;
    }

    return {
        id,
        filename
    };
};

const wixMediaIdToUrl = ({id}: {id?: string; width?: number; height?: number}) => {
    if (!id) {
        return null;
    }

    return buildWixStaticUrl({
        id,
        filename: id
    });
};

const wixImageUriToUrl = (value?: string) => {
    if (!value) {
        return null;
    }

    if (value.startsWith('http://') || value.startsWith('https://')) {
        return value;
    }

    const parts = parseWixImageUri(value);

    if (!parts) {
        return null;
    }

    return buildWixStaticUrl(parts);
};

export {buildWixStaticUrl, parseWixImageUri, wixImageUriToUrl, wixMediaIdToUrl};
