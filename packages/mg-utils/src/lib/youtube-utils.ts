const getYouTubeID = (videoUrl: string | null | undefined): string => {
    if (!videoUrl) {
        return '';
    }
    const arr = videoUrl.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
    return undefined !== arr[2] ? arr[2].split(/[^\w-]/i)[0] : arr[0];
};

export {getYouTubeID};
