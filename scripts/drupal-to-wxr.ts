#!/usr/bin/env npx tsx
/**
 * Drupal SQL → WordPress WXR Converter
 * 
 * Simple script that converts a Drupal SQL dump to WordPress WXR format,
 * which can then be imported using mg-wp-xml.
 * 
 * Usage:
 *   npx tsx scripts/drupal-to-wxr.ts ./dump.sql [--inspect] [--output ./export.xml] [--url https://tellyvisions.org]
 */

import {writeFileSync} from 'fs';
import {createInterface} from 'readline';
import {createReadStream} from 'fs';

// Simple slugify function
const slugify = (text: string): string => {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
};

// Types
interface ParsedTable {
    name: string;
    columns: string[];
    rows: Record<string, unknown>[];
}

interface Tables {
    [name: string]: ParsedTable;
}

// ============================================================================
// SQL Parser (simplified from mg-sql-to-csv)
// ============================================================================

async function parseSQL(filePath: string): Promise<Tables> {
    const tables: Tables = {};
    
    const rl = createInterface({
        input: createReadStream(filePath, {encoding: 'utf-8'}),
        crlfDelay: Infinity
    });

    let buffer = '';
    let currentTable: string | null = null;
    let tableColumns: Record<string, string[]> = {};

    for await (const line of rl) {
        // Skip comments and lock statements
        if (line.startsWith('--') || line.startsWith('/*') || line.startsWith('LOCK') || line.startsWith('UNLOCK')) {
            continue;
        }

        buffer += line + '\n';

        if (line.trim().endsWith(';')) {
            const statement = buffer.trim();
            buffer = '';

            // Parse CREATE TABLE
            if (statement.toUpperCase().startsWith('CREATE TABLE')) {
                const tableMatch = statement.match(/CREATE TABLE\s+`?(\w+)`?/i);
                if (tableMatch) {
                    const tableName = tableMatch[1];
                    currentTable = tableName;
                    
                    // Extract column names
                    const colMatches = statement.matchAll(/^\s+`(\w+)`\s+/gm);
                    const columns: string[] = [];
                    for (const m of colMatches) {
                        if (!['PRIMARY', 'KEY', 'UNIQUE', 'INDEX', 'CONSTRAINT'].includes(m[1].toUpperCase())) {
                            columns.push(m[1]);
                        }
                    }
                    
                    tableColumns[tableName] = columns;
                    tables[tableName] = {name: tableName, columns, rows: []};
                }
            }
            
            // Parse INSERT statements
            else if (statement.toUpperCase().startsWith('INSERT INTO')) {
                const tableMatch = statement.match(/INSERT INTO\s+`?(\w+)`?/i);
                if (tableMatch) {
                    const tableName = tableMatch[1];
                    const columns = tableColumns[tableName] || [];
                    
                    if (!tables[tableName]) {
                        tables[tableName] = {name: tableName, columns, rows: []};
                    }
                    
                    // Extract values - simplified parser
                    const valuesMatch = statement.match(/VALUES\s*(.+);?$/is);
                    if (valuesMatch && columns.length > 0) {
                        const valuesStr = valuesMatch[1];
                        const rows = parseValues(valuesStr, columns);
                        tables[tableName].rows.push(...rows);
                    }
                }
            }
        }
    }

    return tables;
}

function parseValues(valuesStr: string, columns: string[]): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    
    // Split by ),( but handle quoted strings
    let depth = 0;
    let inString = false;
    let escape = false;
    let current = '';
    const valueSets: string[] = [];
    
    for (let i = 0; i < valuesStr.length; i++) {
        const char = valuesStr[i];
        
        if (escape) {
            current += char;
            escape = false;
            continue;
        }
        
        if (char === '\\') {
            escape = true;
            current += char;
            continue;
        }
        
        if (char === "'" && !escape) {
            inString = !inString;
            current += char;
            continue;
        }
        
        if (!inString) {
            if (char === '(') {
                depth++;
                if (depth === 1) {
                    current = '';
                    continue;
                }
            } else if (char === ')') {
                depth--;
                if (depth === 0) {
                    valueSets.push(current);
                    current = '';
                    continue;
                }
            }
        }
        
        current += char;
    }
    
    // Parse each value set
    for (const valueSet of valueSets) {
        const values = parseValueSet(valueSet);
        if (values.length === columns.length) {
            const row: Record<string, unknown> = {};
            for (let i = 0; i < columns.length; i++) {
                row[columns[i]] = values[i];
            }
            rows.push(row);
        }
    }
    
    return rows;
}

function parseValueSet(str: string): unknown[] {
    const values: unknown[] = [];
    let current = '';
    let inString = false;
    let escape = false;
    
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        
        if (escape) {
            // Handle SQL escape sequences
            if (char === 'r') {
                current += '\r';
            } else if (char === 'n') {
                current += '\n';
            } else if (char === 't') {
                current += '\t';
            } else if (char === '\\') {
                current += '\\';
            } else if (char === "'") {
                current += "'";
            } else {
                current += char; // Unknown escape, keep as-is
            }
            escape = false;
            continue;
        }
        
        if (char === '\\') {
            escape = true;
            continue;
        }
        
        if (char === "'" && !escape) {
            inString = !inString;
            continue; // Skip the quote
        }
        
        if (!inString && char === ',') {
            values.push(parseValue(current.trim()));
            current = '';
            continue;
        }
        
        current += char;
    }
    
    values.push(parseValue(current.trim()));
    return values;
}

function parseValue(str: string): unknown {
    if (str === 'NULL' || str === '') return null;
    if (str === 'TRUE') return true;
    if (str === 'FALSE') return false;
    if (/^-?\d+$/.test(str)) return parseInt(str, 10);
    if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
    return str;
}

// ============================================================================
// Schema Inspector
// ============================================================================

function inspectSchema(tables: Tables) {
    console.log('\n📊 Schema Overview\n');
    console.log('==================\n');
    
    // Find content-related tables
    const contentTables = Object.keys(tables).filter(t => 
        t.includes('node') || t.includes('paragraph') || t.includes('body') || t.includes('content')
    ).sort((a, b) => tables[b].rows.length - tables[a].rows.length);
    
    const userTables = Object.keys(tables).filter(t => 
        t.includes('user')
    ).sort((a, b) => tables[b].rows.length - tables[a].rows.length);
    
    const tagTables = Object.keys(tables).filter(t => 
        t.includes('taxonomy') || t.includes('tag') || t.includes('term')
    ).sort((a, b) => tables[b].rows.length - tables[a].rows.length);
    
    console.log('📝 Content Tables:');
    for (const t of contentTables.slice(0, 10)) {
        console.log(`   ${t} (${tables[t].rows.length} rows)`);
        if (tables[t].rows.length > 0) {
            const sample = tables[t].rows[0];
            const cols = Object.keys(sample).slice(0, 5);
            console.log(`      Columns: ${cols.join(', ')}${Object.keys(sample).length > 5 ? '...' : ''}`);
        }
    }
    
    console.log('\n👤 User Tables:');
    for (const t of userTables.slice(0, 5)) {
        console.log(`   ${t} (${tables[t].rows.length} rows)`);
    }
    
    console.log('\n🏷️  Tag Tables:');
    for (const t of tagTables.slice(0, 5)) {
        console.log(`   ${t} (${tables[t].rows.length} rows)`);
    }
    
    // Detect likely body content location
    console.log('\n🔍 Body Content Detection:');
    
    const nodeBody = tables['node__body'];
    const paragraphBody = tables['paragraph__field_body'];
    
    if (nodeBody && nodeBody.rows.length > 0) {
        console.log(`   ✅ Found node__body with ${nodeBody.rows.length} rows (standard Drupal body field)`);
    } else if (paragraphBody && paragraphBody.rows.length > 0) {
        console.log(`   ✅ Found paragraph__field_body with ${paragraphBody.rows.length} rows (Paragraphs module)`);
        console.log(`   ⚠️  Will need to join through node__field_primary_content`);
    } else {
        console.log('   ⚠️  Could not auto-detect body field location');
        console.log('   Looking for tables with "body" or "content" and large text columns...');
        
        for (const [name, table] of Object.entries(tables)) {
            if (table.rows.length > 0 && (name.includes('body') || name.includes('content'))) {
                const row = table.rows[0];
                for (const [col, val] of Object.entries(row)) {
                    if (typeof val === 'string' && val.length > 100 && val.includes('<')) {
                        console.log(`   📄 ${name}.${col} looks like HTML content (${table.rows.length} rows)`);
                    }
                }
            }
        }
    }
    
    // Show sample post
    const nodeData = tables['node_field_data'];
    if (nodeData && nodeData.rows.length > 0) {
        const sample = nodeData.rows.find(r => r.title && String(r.title).length > 5) || nodeData.rows[0];
        console.log('\n📄 Sample Post:');
        console.log(`   ID: ${sample.nid}`);
        console.log(`   Title: ${sample.title}`);
        console.log(`   Status: ${sample.status}`);
        console.log(`   Created: ${new Date(Number(sample.created) * 1000).toISOString()}`);
    }
}

// ============================================================================
// WXR Generator
// ============================================================================

function generateWXR(tables: Tables, siteUrl: string): string {
    const escape = (s: unknown) => String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    const cdata = (s: unknown) => `<![CDATA[${String(s || '')}]]>`;
    
    // Helper to strip HTML tags and decode entities
    const stripHtml = (html: string): string => {
        return html
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    };
    
    // Strip trailing slash from siteUrl
    const baseUrl = siteUrl.replace(/\/$/, '');
    
    // Get data from tables
    const nodeData = tables['node_field_data']?.rows || [];
    const userData = tables['users_field_data']?.rows.filter(u => Number(u.uid) > 0) || [];
    const tagData = tables['taxonomy_term_field_data']?.rows || [];
    const postTagData = tables['node__field_tags']?.rows || [];
    
    // Build user picture lookup (uid → file URI)
    const userPictures = tables['user__user_picture']?.rows || [];
    const allFiles = tables['file_managed']?.rows || [];
    
    // file ID → file URI (with base URL for author images)
    const fileToAbsoluteUri: Map<number, string> = new Map();
    for (const row of allFiles) {
        const fid = Number(row.fid);
        let uri = String(row.uri || '');
        if (uri.startsWith('public://')) {
            const path = uri.substring('public://'.length);
            const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
            uri = baseUrl + '/sites/default/files/' + encodedPath;
        }
        fileToAbsoluteUri.set(fid, uri);
    }
    
    const authorImageLookup: Map<number, string> = new Map();
    for (const row of userPictures) {
        const uid = Number(row.entity_id);
        const fileId = Number(row.user_picture_target_id);
        const uri = fileToAbsoluteUri.get(fileId);
        if (uri) {
            authorImageLookup.set(uid, uri);
        }
    }
    
    // Build author bio lookup (uid → bio text, HTML stripped)
    // Profile bios are in node__field_profile_bio, linked via node__field_user
    const profileUserLink = tables['node__field_user']?.rows || [];
    const profileBios = tables['node__field_profile_bio']?.rows || [];
    
    const authorBioLookup: Map<number, string> = new Map();
    for (const link of profileUserLink) {
        const profileNodeId = Number(link.entity_id);
        const userId = Number(link.field_user_target_id);
        
        const bioEntry = profileBios.find(b => Number(b.entity_id) === profileNodeId);
        if (bioEntry && bioEntry.field_profile_bio_value) {
            // Strip HTML from bio since Ghost doesn't support it
            const bioText = stripHtml(String(bioEntry.field_profile_bio_value));
            authorBioLookup.set(userId, bioText);
        }
    }
    
    console.log(`👤 Found ${authorBioLookup.size} author bios`);
    console.log(`🖼️  Found ${authorImageLookup.size} author images`);
    
    // Get body content - try standard field first, then paragraphs
    let bodyLookup: Map<number, string> = new Map();
    
    const nodeBody = tables['node__body'];
    if (nodeBody && nodeBody.rows.length > 0) {
        // Standard Drupal body field
        for (const row of nodeBody.rows) {
            const nid = Number(row.entity_id);
            const body = String(row.body_value || '');
            if (body) {
                const existing = bodyLookup.get(nid) || '';
                bodyLookup.set(nid, existing + body);
            }
        }
        console.log(`📝 Using node__body for content (${nodeBody.rows.length} entries)`);
    } else {
        // Paragraphs module - need to join through intermediate table and handle all media types
        const primaryContent = tables['node__field_primary_content'];
        const paragraphBody = tables['paragraph__field_body'];
        const paragraphsData = tables['paragraphs_item_field_data'];
        const paragraphMedia = tables['paragraph__field_primary_media'];
        const mediaFieldImage = tables['media__field_media_image'];
        const mediaOembed = tables['media__field_media_oembed_video'];
        const fileManaged = tables['file_managed'];
        const mediaFieldCaption = tables['media__field_caption'];
        
        if (primaryContent && paragraphsData) {
            // Build media ID → file URI lookup (reusing the one we build later, but need it here)
            const mediaToFileUri: Map<number, string> = new Map();
            if (mediaFieldImage && fileManaged) {
                const fileIdToUri: Map<number, string> = new Map();
                for (const row of fileManaged.rows) {
                    const fid = Number(row.fid);
                    let uri = String(row.uri || '');
                    if (uri.startsWith('public://')) {
                        const path = uri.substring('public://'.length);
                        const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
                        uri = baseUrl + '/sites/default/files/' + encodedPath;
                    }
                    fileIdToUri.set(fid, uri);
                }
                
                for (const row of mediaFieldImage.rows) {
                    const mediaId = Number(row.entity_id);
                    const fileId = Number(row.field_media_image_target_id);
                    const uri = fileIdToUri.get(fileId);
                    if (uri) {
                        mediaToFileUri.set(mediaId, uri);
                    }
                }
            }
            
            // Build media ID → oembed URL lookup (for YouTube, etc.)
            const mediaToOembed: Map<number, string> = new Map();
            if (mediaOembed) {
                for (const row of mediaOembed.rows) {
                    const mediaId = Number(row.entity_id);
                    const url = String(row.field_media_oembed_video_value || '');
                    if (url) {
                        mediaToOembed.set(mediaId, url);
                    }
                }
            }
            
            // Build media ID → caption lookup
            const mediaToCaptions: Map<number, string> = new Map();
            if (mediaFieldCaption) {
                for (const row of mediaFieldCaption.rows) {
                    const mediaId = Number(row.entity_id);
                    const caption = String(row.field_caption_value || '');
                    if (caption) {
                        mediaToCaptions.set(mediaId, caption);
                    }
                }
            }
            
            // Build paragraph ID → type lookup
            const paragraphTypes: Map<number, string> = new Map();
            for (const row of paragraphsData.rows) {
                const pid = Number(row.id);
                const type = String(row.type || '');
                paragraphTypes.set(pid, type);
            }
            
            // Build paragraph ID → body text lookup
            const paragraphBodyLookup: Map<number, string> = new Map();
            if (paragraphBody) {
                for (const row of paragraphBody.rows) {
                    const pid = Number(row.entity_id);
                    const body = String(row.field_body_value || '');
                    if (body) {
                        paragraphBodyLookup.set(pid, body);
                    }
                }
            }
            
            // Build paragraph ID → media ID lookup
            const paragraphMediaLookup: Map<number, number> = new Map();
            if (paragraphMedia) {
                for (const row of paragraphMedia.rows) {
                    const pid = Number(row.entity_id);
                    const mediaId = Number(row.field_primary_media_target_id);
                    if (mediaId) {
                        paragraphMediaLookup.set(pid, mediaId);
                    }
                }
            }
            
            // Build paragraph ID → heading lookup (size + text)
            const paragraphHeadingLookup: Map<number, {format: string, text: string}> = new Map();
            const paragraphHeading = tables['paragraph__field_heading'];
            if (paragraphHeading) {
                for (const row of paragraphHeading.rows) {
                    const pid = Number(row.entity_id);
                    const format = String(row.field_heading_size || 'h2');
                    const text = String(row.field_heading_text || '');
                    if (text) {
                        paragraphHeadingLookup.set(pid, {format, text});
                    }
                }
            }
            
            // Build paragraph ID → quote lookup
            const paragraphQuoteLookup: Map<number, string> = new Map();
            const paragraphQuote = tables['paragraph__field_quote'];
            if (paragraphQuote) {
                for (const row of paragraphQuote.rows) {
                    const pid = Number(row.entity_id);
                    const quote = String(row.field_quote_value || '');
                    if (quote) {
                        paragraphQuoteLookup.set(pid, quote);
                    }
                }
            }
            
            // Build tweet/instagram oembed lookups (through media)
            const mediaToTwitter: Map<number, string> = new Map();
            const mediaTwitter = tables['media__field_media_twitter'];
            if (mediaTwitter) {
                for (const row of mediaTwitter.rows) {
                    const mediaId = Number(row.entity_id);
                    const url = String(row.field_media_twitter_value || '');
                    if (url) {
                        mediaToTwitter.set(mediaId, url);
                    }
                }
            }
            
            const mediaToInstagram: Map<number, string> = new Map();
            const mediaInstagram = tables['media__field_media_oembed_instagram'];
            if (mediaInstagram) {
                for (const row of mediaInstagram.rows) {
                    const mediaId = Number(row.entity_id);
                    const url = String(row.field_media_oembed_instagram_value || '');
                    if (url) {
                        mediaToInstagram.set(mediaId, url);
                    }
                }
            }
            
            // Group paragraphs by node and sort by delta
            const nodeParas: Map<number, Array<{delta: number, pid: number}>> = new Map();
            for (const row of primaryContent.rows) {
                const nid = Number(row.entity_id);
                const pid = Number(row.field_primary_content_target_id);
                const delta = Number(row.delta || 0);
                
                if (!nodeParas.has(nid)) {
                    nodeParas.set(nid, []);
                }
                nodeParas.get(nid)!.push({delta, pid});
            }
            
            // Build content for each node by processing paragraphs in order
            let imageCount = 0;
            let videoCount = 0;
            let headingCount = 0;
            let quoteCount = 0;
            let dividerCount = 0;
            let tweetCount = 0;
            let instagramCount = 0;
            
            for (const [nid, paras] of nodeParas) {
                // Sort by delta
                paras.sort((a, b) => a.delta - b.delta);
                
                let content = '';
                for (const {pid} of paras) {
                    const type = paragraphTypes.get(pid) || '';
                    
                    if (type === 'rich_text') {
                        const body = paragraphBodyLookup.get(pid);
                        if (body) {
                            content += body + '\n\n';
                        }
                    } else if (type === 'heading') {
                        const heading = paragraphHeadingLookup.get(pid);
                        if (heading) {
                            const tag = heading.format || 'h2';
                            content += `<${tag}>${heading.text}</${tag}>\n\n`;
                            headingCount++;
                        }
                    } else if (type === 'quote') {
                        const quote = paragraphQuoteLookup.get(pid);
                        if (quote) {
                            content += `<blockquote>${quote}</blockquote>\n\n`;
                            quoteCount++;
                        }
                    } else if (type === 'divider') {
                        content += `<hr />\n\n`;
                        dividerCount++;
                    } else if (type === 'image') {
                        const mediaId = paragraphMediaLookup.get(pid);
                        if (mediaId) {
                            const imageUrl = mediaToFileUri.get(mediaId);
                            const caption = mediaToCaptions.get(mediaId);
                            if (imageUrl) {
                                if (caption) {
                                    content += `<figure><img src="${imageUrl}" /><figcaption>${caption}</figcaption></figure>\n\n`;
                                } else {
                                    content += `<img src="${imageUrl}" />\n\n`;
                                }
                                imageCount++;
                            }
                        }
                    } else if (type === 'video' || type === 'remote_video' || type === 'pbs_video') {
                        const mediaId = paragraphMediaLookup.get(pid);
                        if (mediaId) {
                            // Try oembed first (YouTube, Vimeo, etc.)
                            const oembedUrl = mediaToOembed.get(mediaId);
                            if (oembedUrl) {
                                // Use iframes with &nbsp; inside to prevent self-closing issues
                                // The HTML to MobileDoc converter will convert these to embed cards
                                if (oembedUrl.includes('youtube.com') || oembedUrl.includes('youtu.be')) {
                                    const videoId = oembedUrl.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1];
                                    if (videoId) {
                                        content += `<iframe src="https://www.youtube.com/embed/${videoId}?feature=oembed" width="560" height="315" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen>&nbsp;</iframe>\n\n`;
                                        videoCount++;
                                    }
                                } else if (oembedUrl.includes('vimeo.com')) {
                                    const videoId = oembedUrl.match(/vimeo\.com\/(\d+)/)?.[1];
                                    if (videoId) {
                                        content += `<iframe src="https://player.vimeo.com/video/${videoId}" width="640" height="360" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen>&nbsp;</iframe>\n\n`;
                                        videoCount++;
                                    }
                                } else {
                                    // Generic video link in figure
                                    content += `<figure class="kg-card kg-embed-card"><a href="${oembedUrl}">${oembedUrl}</a></figure>\n\n`;
                                    videoCount++;
                                }
                            } else {
                                // Try local video file
                                const videoUrl = mediaToFileUri.get(mediaId);
                                if (videoUrl) {
                                    content += `<figure class="kg-card kg-video-card"><video src="${videoUrl}" controls>&nbsp;</video></figure>\n\n`;
                                    videoCount++;
                                }
                            }
                        }
                    } else if (type === 'tweet') {
                        const mediaId = paragraphMediaLookup.get(pid);
                        if (mediaId) {
                            const tweetUrl = mediaToTwitter.get(mediaId);
                            if (tweetUrl) {
                                // Ghost can embed tweets via URL
                                content += `<figure class="kg-card kg-embed-card"><a href="${tweetUrl}">${tweetUrl}</a></figure>\n\n`;
                                tweetCount++;
                            }
                        }
                    } else if (type === 'instagram') {
                        const mediaId = paragraphMediaLookup.get(pid);
                        if (mediaId) {
                            const instaUrl = mediaToInstagram.get(mediaId);
                            if (instaUrl) {
                                content += `<figure class="kg-card kg-embed-card"><a href="${instaUrl}">${instaUrl}</a></figure>\n\n`;
                                instagramCount++;
                            }
                        }
                    }
                    // Other paragraph types (block, section, stream_show_widget, etc.) skipped
                }
                
                if (content) {
                    bodyLookup.set(nid, content.trim());
                }
            }
            
            console.log(`📝 Using Paragraphs module for content`);
            console.log(`   📄 ${paragraphBodyLookup.size} text paragraphs`);
            console.log(`   📰 ${headingCount} headings`);
            console.log(`   💬 ${quoteCount} quotes`);
            console.log(`   ➖ ${dividerCount} dividers`);
            console.log(`   🖼️  ${imageCount} inline images`);
            console.log(`   🎬 ${videoCount} videos`);
            if (tweetCount > 0) console.log(`   🐦 ${tweetCount} tweets`);
            if (instagramCount > 0) console.log(`   📸 ${instagramCount} Instagram embeds`);
        }
    }
    
    console.log(`📊 Found ${bodyLookup.size} posts with body content out of ${nodeData.length} total`);
    
    // Build featured image lookup
    // Chain: node → node__field_primary_media → media__field_media_image → file_managed
    const nodePrimaryMedia = tables['node__field_primary_media']?.rows || [];
    const mediaFieldImage = tables['media__field_media_image']?.rows || [];
    const fileManaged = tables['file_managed']?.rows || [];
    
    // media ID → file ID
    const mediaToFile: Map<number, number> = new Map();
    for (const row of mediaFieldImage) {
        const mediaId = Number(row.entity_id);
        const fileId = Number(row.field_media_image_target_id);
        if (fileId) {
            mediaToFile.set(mediaId, fileId);
        }
    }
    
    // file ID → file URI
    const fileToUri: Map<number, string> = new Map();
    for (const row of fileManaged) {
        const fid = Number(row.fid);
        let uri = String(row.uri || '');
        // Convert public:// to actual path and URL-encode the filename
        if (uri.startsWith('public://')) {
            const path = uri.substring('public://'.length);
            // Split path, encode each segment, rejoin
            const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
            uri = '/sites/default/files/' + encodedPath;
        }
        fileToUri.set(fid, uri);
    }
    
    // node ID → featured image URL
    const featuredImageLookup: Map<number, string> = new Map();
    for (const row of nodePrimaryMedia) {
        const nid = Number(row.entity_id);
        const mediaId = Number(row.field_primary_media_target_id);
        const fileId = mediaToFile.get(mediaId);
        if (fileId) {
            const uri = fileToUri.get(fileId);
            if (uri) {
                featuredImageLookup.set(nid, baseUrl + uri);
            }
        }
    }
    
    console.log(`🖼️  Found ${featuredImageLookup.size} featured images`);
    
    // Build post → authors lookup from node__field_author
    // This field references profile nodes, which we need to resolve to user IDs
    const postAuthors = tables['node__field_author']?.rows || [];
    
    // Build profile node → user ID lookup (reusing profileUserLink from earlier)
    const profileToUser: Map<number, number> = new Map();
    for (const link of profileUserLink) {
        const profileNodeId = Number(link.entity_id);
        const userId = Number(link.field_user_target_id);
        profileToUser.set(profileNodeId, userId);
    }
    
    // Build post → author user IDs lookup (sorted by delta for primary author first)
    const postAuthorLookup: Map<number, number[]> = new Map();
    let multiAuthorPosts = 0;
    for (const row of postAuthors) {
        const nid = Number(row.entity_id);
        const profileNodeId = Number(row.field_author_target_id);
        const delta = Number(row.delta || 0);
        const userId = profileToUser.get(profileNodeId);
        
        if (userId) {
            if (!postAuthorLookup.has(nid)) {
                postAuthorLookup.set(nid, []);
            }
            const authors = postAuthorLookup.get(nid)!;
            // Insert at correct position based on delta
            authors[delta] = userId;
        }
    }
    
    // Count multi-author posts
    for (const [nid, authors] of postAuthorLookup) {
        if (authors.filter(Boolean).length > 1) {
            multiAuthorPosts++;
        }
    }
    
    console.log(`✍️  Found ${postAuthorLookup.size} posts with author field`);
    if (multiAuthorPosts > 0) {
        console.log(`   👥 ${multiAuthorPosts} posts have multiple authors (all will be imported)`);
    }
    
    // Generate WXR
    let wxr = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
    xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
    xmlns:content="http://purl.org/rss/1.0/modules/content/"
    xmlns:wfw="http://wellformedweb.org/CommentAPI/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
    <title>Drupal Import</title>
    <link>${baseUrl}</link>
    <wp:wxr_version>1.2</wp:wxr_version>
    <wp:base_site_url>${baseUrl}</wp:base_site_url>
    <wp:base_blog_url>${baseUrl}</wp:base_blog_url>
`;

    // Authors (with bios)
    for (const user of userData) {
        const uid = Number(user.uid);
        const bio = authorBioLookup.get(uid) || '';
        const avatar = authorImageLookup.get(uid) || '';
        
        wxr += `
    <wp:author>
        <wp:author_id>${uid}</wp:author_id>
        <wp:author_login>${cdata(user.name)}</wp:author_login>
        <wp:author_email>${cdata(user.mail || `user${uid}@placeholder.com`)}</wp:author_email>
        <wp:author_display_name>${cdata(user.name)}</wp:author_display_name>
        <wp:author_first_name>${cdata('')}</wp:author_first_name>
        <wp:author_last_name>${cdata('')}</wp:author_last_name>
        <wp:author_description>${cdata(bio)}</wp:author_description>
        <wp:author_avatar>${cdata(avatar)}</wp:author_avatar>
    </wp:author>`;
    }

    // Tags
    for (const tag of tagData) {
        const slug = String(tag.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        wxr += `
    <wp:tag>
        <wp:term_id>${tag.tid}</wp:term_id>
        <wp:tag_slug>${cdata(slug)}</wp:tag_slug>
        <wp:tag_name>${cdata(tag.name)}</wp:tag_name>
    </wp:tag>`;
    }

    // Build URL alias lookup from path_alias table
    // path_alias maps /node/{nid} -> /article/some-slug or /podcast/some-slug
    const pathAliasData = tables['path_alias']?.rows || [];
    const urlLookup: Map<number, string> = new Map();
    
    for (const alias of pathAliasData) {
        const path = String(alias.path || '');
        const urlPath = String(alias.alias || '');
        const match = path.match(/^\/node\/(\d+)$/);
        if (match && urlPath) {
            const nid = parseInt(match[1], 10);
            urlLookup.set(nid, urlPath);
        }
    }
    
    console.log(`🔗 Found ${urlLookup.size} URL aliases`);

    // Posts and Pages
    // Skip non-content types like profile, podcast_playlist
    const contentTypes = ['article', 'podcast_episode', 'page', 'landing_page'];
    const pageTypes = ['page', 'landing_page'];
    
    let postCount = 0;
    let pageCount = 0;
    
    for (const post of nodeData) {
        const nodeType = String(post.type || '').replace(/'/g, '');
        
        // Skip non-content types
        if (!contentTypes.includes(nodeType)) {
            continue;
        }
        
        // Determine if this is a page or post
        const wpPostType = pageTypes.includes(nodeType) ? 'page' : 'post';
        if (wpPostType === 'page') {
            pageCount++;
        } else {
            postCount++;
        }
        
        const nid = Number(post.nid);
        const title = String(post.title || 'Untitled');
        const fallbackSlug = String(post.title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        
        // Use the real URL alias if available, otherwise fall back to generated slug
        const urlPath = urlLookup.get(nid) || `/${fallbackSlug}`;
        const slug = urlPath.split('/').pop() || fallbackSlug;
        
        const status = Number(post.status) === 1 ? 'publish' : 'draft';
        const created = new Date(Number(post.created) * 1000);
        const dateStr = created.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
        // Use author from node__field_author if available, fallback to node owner
        const authorFromField = postAuthorLookup.get(nid)?.[0];
        const authorId = authorFromField || Number(post.uid) || 1;
        
        const content = bodyLookup.get(nid) || '';
        
        // Get featured image
        const featuredImage = featuredImageLookup.get(nid) || '';
        
        // Get tags for this post
        const postTags = postTagData.filter(pt => Number(pt.entity_id) === nid);
        let tagElements = '';
        for (const pt of postTags) {
            const tag = tagData.find(t => Number(t.tid) === Number(pt.field_tags_target_id));
            if (tag) {
                const tagSlug = String(tag.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                tagElements += `
        <category domain="post_tag" nicename="${escape(tagSlug)}">${cdata(tag.name)}</category>`;
            }
        }
        
        // Add internal tag for podcast episodes so they can be identified in Ghost
        if (nodeType === 'podcast_episode') {
            tagElements += `
        <category domain="post_tag" nicename="hash-podcast">${cdata('#podcast')}</category>`;
        }
        
        // Add thumbnail postmeta if we have a featured image
        let postMeta = '';
        if (featuredImage) {
            // Use a large offset for attachment IDs to avoid collisions with post IDs
            const attachmentId = 1000000 + nid;
            postMeta += `
        <wp:postmeta>
            <wp:meta_key>_thumbnail_id</wp:meta_key>
            <wp:meta_value>${attachmentId}</wp:meta_value>
        </wp:postmeta>`;
        }
        
        // Add all authors as postmeta for Ghost multi-author support
        const postAuthorIds = postAuthorLookup.get(nid)?.filter(Boolean) || [];
        if (postAuthorIds.length > 0) {
            // Convert user IDs to slugs
            const authorSlugs = postAuthorIds
                .map(uid => {
                    const user = userData.find(u => Number(u.uid) === uid);
                    return user ? slugify(String(user.name || '')) : null;
                })
                .filter(Boolean);
            
            if (authorSlugs.length > 0) {
                postMeta += `
        <wp:postmeta>
            <wp:meta_key>_ghost_authors</wp:meta_key>
            <wp:meta_value>${authorSlugs.join(',')}</wp:meta_value>
        </wp:postmeta>`;
            }
        }

        // Get the primary author name for dc:creator
        const primaryAuthorName = userData.find(u => Number(u.uid) === authorId)?.name || 'admin';

        wxr += `
    <item>
        <title>${cdata(title)}</title>
        <link>${baseUrl}${escape(urlPath)}</link>
        <pubDate>${created.toUTCString()}</pubDate>
        <dc:creator>${cdata(primaryAuthorName)}</dc:creator>
        <content:encoded>${cdata(content)}</content:encoded>
        <excerpt:encoded>${cdata('')}</excerpt:encoded>
        <wp:post_id>${nid}</wp:post_id>
        <wp:post_date>${dateStr}</wp:post_date>
        <wp:post_date_gmt>${dateStr}</wp:post_date_gmt>
        <wp:post_name>${cdata(slug)}</wp:post_name>
        <wp:status>${status}</wp:status>
        <wp:post_type>${wpPostType}</wp:post_type>${tagElements}${postMeta}
    </item>`;
    }
    
    // Add attachment items for featured images
    for (const post of nodeData) {
        const nid = Number(post.nid);
        const featuredImage = featuredImageLookup.get(nid);
        if (!featuredImage) continue;
        
        const attachmentId = 1000000 + nid;
        const title = String(post.title || 'Untitled');
        const created = new Date(Number(post.created) * 1000);
        const dateStr = created.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
        
        wxr += `
    <item>
        <title>${cdata(title + ' - Featured Image')}</title>
        <link>${escape(featuredImage)}</link>
        <wp:post_id>${attachmentId}</wp:post_id>
        <wp:post_date>${dateStr}</wp:post_date>
        <wp:post_date_gmt>${dateStr}</wp:post_date_gmt>
        <wp:post_parent>${nid}</wp:post_parent>
        <wp:status>inherit</wp:status>
        <wp:post_type>attachment</wp:post_type>
        <wp:attachment_url>${escape(featuredImage)}</wp:attachment_url>
    </item>`;
    }

    wxr += `
</channel>
</rss>`;

    console.log(`📝 Exported ${postCount} posts and ${pageCount} pages`);
    
    return wxr;
}

// ============================================================================
// Main
// ============================================================================

function getArg(args: string[], name: string): string | null {
    const idx = args.findIndex(a => a === name);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

async function main() {
    const args = process.argv.slice(2);
    const sqlPath = args.find(a => !a.startsWith('--'));
    const inspect = args.includes('--inspect');
    const outputPath = getArg(args, '--output');
    const siteUrl = getArg(args, '--url') || 'https://example.com';
    
    if (!sqlPath) {
        console.log(`
Usage: npx tsx scripts/drupal-to-wxr.ts <sql-dump> [options]

Options:
  --inspect         Show schema overview without generating WXR
  --output <path>   Output path for WXR file (default: ./drupal-export.xml)
  --url <url>       Site URL for asset scraping (REQUIRED for migration)

Examples:
  npx tsx scripts/drupal-to-wxr.ts ./tellyvisions.sql --inspect
  npx tsx scripts/drupal-to-wxr.ts ./tellyvisions.sql --url https://tellyvisions.org --output ./tellyvisions.xml
`);
        process.exit(1);
    }
    
    if (siteUrl === 'https://example.com' && !inspect) {
        console.log('⚠️  Warning: No --url provided. Using example.com as placeholder.');
        console.log('   For asset scraping to work, provide the real site URL with --url\n');
    }
    
    console.log(`\n🔄 Parsing SQL dump: ${sqlPath}\n`);
    const startTime = Date.now();
    const tables = await parseSQL(sqlPath);
    const parseTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Parsed ${Object.keys(tables).length} tables in ${parseTime}s\n`);
    
    if (inspect) {
        inspectSchema(tables);
        return;
    }
    
    console.log(`🔄 Generating WXR for ${siteUrl}...\n`);
    const wxr = generateWXR(tables, siteUrl);
    
    const output = outputPath || './drupal-export.xml';
    writeFileSync(output, wxr);
    console.log(`\n✅ WXR written to: ${output}`);
    console.log(`   File size: ${(wxr.length / 1024 / 1024).toFixed(1)} MB`);
    
    console.log(`
Next steps:
  1. Review the WXR file (it's readable XML)
  2. Run the Ghost migration:
     yarn dev wp-xml --pathToFile ${output}
`);
}

main().catch(console.error);
