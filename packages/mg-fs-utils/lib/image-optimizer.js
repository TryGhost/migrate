const path = require('path');

const unsafeResizeImage = (originalBuffer, {width, height} = {}) => {
    const sharp = require('sharp');
    return sharp(originalBuffer)
        .resize(width, height, {
            // CASE: dont make the image bigger than it was
            withoutEnlargement: true
        })
        // CASE: Automatically remove metadata and rotate based on the orientation.
        .rotate()
        .toBuffer()
        .then((resizedBuffer) => {
            return resizedBuffer.length < originalBuffer.length ? resizedBuffer : originalBuffer;
        });
};

module.exports.generateOriginalImageName = (originalPath) => {
    const parsedFileName = path.parse(originalPath);
    return path.join(parsedFileName.dir, `${parsedFileName.name}_o${parsedFileName.ext}`);
};

module.exports.defaultOptimization = (originalBuffer) => {
    return unsafeResizeImage(originalBuffer, {width: 2000});
};
