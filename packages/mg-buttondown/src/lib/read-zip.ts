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

    fsUtils.zip.read(zipPath, (entryName: string, zipEntry: any) => {
        // Catch all MD files inside `emails/`
        if (/^emails\/.*\.md$/.test(entryName) || /\/emails\/.*\.md$/.test(entryName)) {
            content.posts.push({
                name: entryName.replace('emails/', ''),
                html: zipEntry.getData().toString('utf8')
            });

        // Get the emails.json
        } else if (entryName === 'emails.json' || entryName.endsWith('/emails.json')) {
            content.json = JSON.parse(zipEntry.getData().toString('utf8'));
        }
    });

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
