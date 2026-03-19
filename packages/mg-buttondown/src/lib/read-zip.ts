import fsUtils from '@tryghost/mg-fs-utils';

const contentStats = async (zipPath: string) => {
    const entries = await fsUtils.readZipEntries(zipPath);

    const posts = entries.filter((value: string) => /emails\/.*\.md/.test(value)).length;

    return {
        posts: posts
    };
};

const readZip = (zipPath: string) => {
    let content: any = {
        json: null,
        posts: []
    };

    let csvString: string | null = null;

    fsUtils.zip.read(zipPath, (entryName: string, zipEntry: any) => {
        if (/^emails\/.*\.md$/.test(entryName) || /\/emails\/.*\.md$/.test(entryName)) {
            content.posts.push({
                name: entryName.replace('emails/', ''),
                html: zipEntry.getData().toString('utf8')
            });
        } else if (entryName === 'emails.json' || entryName.endsWith('/emails.json')) {
            content.json = JSON.parse(zipEntry.getData().toString('utf8'));
        } else if (entryName === 'emails.csv' || entryName.endsWith('/emails.csv')) {
            csvString = zipEntry.getData().toString('utf8');
        }
    });

    if (!content.json && csvString) {
        content.json = fsUtils.csv.parseString(csvString);
    }

    content.posts.sort((a: any, b: any) => a.name.localeCompare(b.name));

    if (content.json && Array.isArray(content.json)) {
        content.json.sort((a: any, b: any) => a.slug.localeCompare(b.slug));
    }

    return content;
};

export {
    contentStats,
    readZip
};
