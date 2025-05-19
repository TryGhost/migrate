import process from '../lib/process.js';

describe('Process', () => {
    test('can process a post', async () => {
        const testPost = {
            uid: 'test123',
            title: 'Test Post',
            slug: 'test-post',
            'published date': '2025-01-01T00:00:00Z',
            'first published at': '2025-01-01T00:00:00Z',
            'all tags': '[tag1, tag2]',
            publish: 'True',
            'is page': 'False',
            content: '# Test Content',
            'meta description': 'Test description',
            'meta image': 'https://example.com/image.jpg'
        };

        const result = await process.processPost(testPost);

        expect(result.data.title).toBe('Test Post');
        expect(result.data.slug).toBe('test-post');
        expect(result.data.status).toBe('published');
        expect(result.data.created_at).toBe('2025-01-01T00:00:00Z');
        expect(result.data.published_at).toBe('2025-01-01T00:00:00Z');
        expect(result.data.custom_excerpt).toBe('Test description');
        expect(result.data.feature_image).toBe('https://example.com/image.jpg');
        expect(result.data.type).toBe('post');
        expect(result.data.tags).toHaveLength(2);
        expect(result.data.tags[0].data.name).toBe('tag1');
        expect(result.data.tags[1].data.name).toBe('tag2');
        
        // Verify Lexical format
        const lexical = JSON.parse(result.data.lexical);
        expect(lexical.root.children[0].type).toBe('extended-heading');
        expect(lexical.root.children[0].tag).toBe('h1');
        expect(lexical.root.children[0].children[0].text).toBe('Test Content');
    });

    test('can handle HTML in markdown content', async () => {
        const testPost = {
            title: 'HTML Test',
            slug: 'html-test',
            'published date': '2025-01-01T00:00:00Z',
            content: '# Heading\n\n<div class="custom">Custom HTML</div>\n\n**Bold**',
            publish: 'True'
        };

        const result = await process.processPost(testPost);
        const lexical = JSON.parse(result.data.lexical);
        
        expect(lexical.root.children).toHaveLength(3);
        expect(lexical.root.children[0].type).toBe('extended-heading');
        expect(lexical.root.children[1].type).toBe('paragraph');
        expect(lexical.root.children[2].type).toBe('paragraph');
    });

    test('handles special characters in title and content', async () => {
        const testPost = {
            title: 'Special & Characters © ®',
            slug: 'special-chars',
            'published date': '2025-01-01T00:00:00Z',
            content: '# Special & Heading ©\n\n**Bold & Beautiful**',
            publish: 'True'
        };

        const result = await process.processPost(testPost);
        expect(result.data.title).toBe('Special & Characters © ®');
        
        const lexical = JSON.parse(result.data.lexical);
        expect(lexical.root.children[0].children[0].text).toBe('Special & Heading ©');
    });

    test('handles empty content gracefully', async () => {
        const testPost = {
            title: 'Empty Post',
            slug: 'empty',
            'published date': '2025-01-01T00:00:00Z',
            content: '',
            publish: 'True'
        };

        const result = await process.processPost(testPost);
        const lexical = JSON.parse(result.data.lexical);
        expect(lexical.root.children).toHaveLength(1);
        expect(lexical.root.children[0].type).toBe('paragraph');
        expect(lexical.root.children[0].children).toHaveLength(0);
    });

    test('handles different date formats', async () => {
        const testPost = {
            title: 'Date Test',
            slug: 'date-test',
            'published date': '2025-01-01',
            'first published at': '2025/01/01 12:00:00',
            content: 'Test',
            publish: 'True'
        };

        const result = await process.processPost(testPost);
        expect(result.data.published_at).toBe('2025-01-01');
        expect(result.data.created_at).toBe('2025/01/01 12:00:00');
    });

    test('handles tag parsing edge cases', async () => {
        const cases = [
            {
                input: '[tag1,  tag2 , tag3]',
                expected: ['tag1', 'tag2', 'tag3']
            },
            {
                input: '[]',
                expected: []
            },
            {
                input: '[Single Tag]',
                expected: ['Single Tag']
            },
            {
                input: undefined,
                expected: []
            }
        ];

        for (const testCase of cases) {
            const testPost = {
                title: 'Tag Test',
                slug: 'tag-test',
                'published date': '2025-01-01T00:00:00Z',
                'all tags': testCase.input,
                content: 'Test',
                publish: 'True'
            };

            const result = await process.processPost(testPost);
            expect(result.data.tags.map(t => t.data.name)).toEqual(testCase.expected);
        }
    });

    test('can process CSV input', async () => {
        const csvInput = `uid,title,slug,published date,first published at,all tags,publish,is page,content,meta description,meta image
test123,Test Post,test-post,2025-01-01T00:00:00Z,2025-01-01T00:00:00Z,[tag1],True,False,Test content,Test description,https://example.com/image.jpg`;

        const result = await process.all(csvInput);

        expect(result.posts).toHaveLength(1);
        expect(result.posts[0].data.title).toBe('Test Post');
        expect(result.posts[0].data.slug).toBe('test-post');
    });

    test('handles invalid CSV format', async () => {
        const invalidCsv = 'invalid,csv\nformat,data';
        
        await expect(process.all(invalidCsv)).rejects.toThrow('Missing required fields');
    });

    test('handles missing required fields', async () => {
        const csvInput = `uid,wrong_field\ntest123,value`;
        
        await expect(process.all(csvInput)).rejects.toThrow('Missing required fields');
    });
}); 