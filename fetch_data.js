#!/usr/bin/env node
/**
 * fetch_data.js
 * Clones the hak5 WiFi Pineapple Pager repos (payloads, themes, ringtones),
 * processes local files, fetches PRs, and writes payloads.json.
 * 
 * Usage:
 *   node fetch_data.js
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, basename, relative } from 'path';
import { execSync } from 'child_process';

const OUTPUT_FILE = 'payloads.json';
const REPO_OWNER = 'hak5';
const BRANCH = 'master';

const REPOS = {
    payloads: {
        name: 'wifipineapplepager-payloads',
        url: 'https://github.com/hak5/wifipineapplepager-payloads.git',
        clonePath: '/tmp/wifipineapplepager-payloads'
    },
    themes: {
        name: 'wifipineapplepager-themes',
        url: 'https://github.com/hak5/wifipineapplepager-themes.git',
        clonePath: '/tmp/wifipineapplepager-themes'
    },
    ringtones: {
        name: 'wifipineapplepager-ringtones',
        url: 'https://github.com/hak5/wifipineapplepager-ringtones.git',
        clonePath: '/tmp/wifipineapplepager-ringtones'
    }
};

function parsePayloadHeader(source) {
    const lines = source.split('\n').slice(0, 30);
    const meta = {};
    const commentLines = [];
    for (const line of lines) {
        const m = line.match(/^#\s*(Title|Name|Author|Description|Version|Category)\s*:\s*(.+)/i);
        if (m) {
            meta[m[1].toLowerCase()] = m[2].trim();
        }
        if (line.startsWith('#') && !line.startsWith('#!')) {
            const cleaned = line.replace(/^#+\s*/, '').trim();
            if (cleaned && !cleaned.match(/^(Title|Name|Author|Description|Version|Category)\s*:/i)) {
                commentLines.push(cleaned);
            }
        }
    }
    if (!meta.title && meta.name) meta.title = meta.name;
    if (!meta.description && commentLines.length > 0) {
        meta.description = commentLines.join(' ').substring(0, 300);
    }
    return meta;
}

function isDirectory(p) {
    try { return statSync(p).isDirectory(); } catch { return false; }
}

function isFile(p) {
    try { return statSync(p).isFile(); } catch { return false; }
}

function readFileSafe(p) {
    try { return readFileSync(p, 'utf-8'); } catch { return null; }
}

function resolveReadmeImages(readme, themePath) {
    if (!readme) return readme;

    // Build a map of lowercase relative path -> actual relative path
    const fileMap = new Map();
    function walkDir(dir, rel) {
        try {
            for (const entry of readdirSync(dir)) {
                if (entry.startsWith('.')) continue;
                const full = join(dir, entry);
                const relPath = rel ? `${rel}/${entry}` : entry;
                try {
                    if (statSync(full).isDirectory()) {
                        walkDir(full, relPath);
                    } else {
                        fileMap.set(relPath.toLowerCase(), relPath);
                    }
                } catch { /* skip */ }
            }
        } catch { /* skip */ }
    }
    walkDir(themePath, '');

    // Replace image paths in both HTML img tags and markdown images
    // HTML: <img src="path" ...>
    readme = readme.replace(/(<img\s+[^>]*src=["'])([^"']+)(["'])/gi, (match, pre, url, post) => {
        if (url.startsWith('http://') || url.startsWith('https://')) return match;
        const actual = fileMap.get(url.toLowerCase());
        return actual ? `${pre}${actual}${post}` : match;
    });

    // Markdown: ![alt](path)
    readme = readme.replace(/(!\[[^\]]*\]\()([^)]+)(\))/g, (match, pre, url, post) => {
        if (url.startsWith('http://') || url.startsWith('https://')) return match;
        const actual = fileMap.get(url.toLowerCase());
        return actual ? `${pre}${actual}${post}` : match;
    });

    return readme;
}

function findReadme(dirPath) {
    try {
        const entries = readdirSync(dirPath);
        // Prefer .md, then .txt, then bare README
        const md = entries.find(e => /^readme\.md$/i.test(e));
        if (md) return readFileSafe(join(dirPath, md));
        const txt = entries.find(e => /^readme\.txt$/i.test(e));
        if (txt) return readFileSafe(join(dirPath, txt));
        const bare = entries.find(e => /^readme$/i.test(e));
        return bare ? readFileSafe(join(dirPath, bare)) : null;
    } catch { return null; }
}

function walkPayloadDirs(dirPath, results = [], depth = 0) {
    if (depth > 6) return results;
    try {
        const entries = readdirSync(dirPath);

        // If this directory contains payload.sh, it's a payload directory
        if (entries.includes('payload.sh')) {
            results.push(dirPath);
            return results;
        }

        // Otherwise recurse into subdirectories
        for (const entry of entries) {
            const fullPath = join(dirPath, entry);
            if (isDirectory(fullPath) && !entry.startsWith('.')) {
                walkPayloadDirs(fullPath, results, depth + 1);
            }
        }
    } catch { /* ignore */ }
    return results;
}

function cloneOrUpdateRepo(repo) {
    const checkDir = repo.name.includes('payloads') ? 'library' :
        repo.name.includes('themes') ? 'themes' : 'ringtones';
    if (!existsSync(join(repo.clonePath, checkDir))) {
        console.log(`📡 Cloning ${repo.name} to ${repo.clonePath}...`);
        try {
            execSync(`git clone --depth 1 ${repo.url} ${repo.clonePath}`, { stdio: 'inherit' });
        } catch (err) {
            console.error(`❌ Failed to clone ${repo.name}.`);
            return false;
        }
    } else {
        console.log(`📂 Using existing ${repo.name} at ${repo.clonePath}`);
    }
    return true;
}

function processPayloads(repoPath) {
    const libraryPath = join(repoPath, 'library');
    if (!existsSync(libraryPath)) {
        console.error('❌ library/ directory not found!');
        return { categories: {}, totalPayloads: 0 };
    }

    const categoryDirs = readdirSync(libraryPath)
        .filter(e => isDirectory(join(libraryPath, e)) && !e.startsWith('.'));

    console.log(`\n📂 Found payload categories: ${categoryDirs.join(', ')}\n`);

    const categories = {};
    let totalPayloads = 0;

    for (const catName of categoryDirs) {
        const catPath = join(libraryPath, catName);
        const catReadme = findReadme(catPath);

        console.log(`\n📂 Category: ${catName.toUpperCase()}`);

        const subcategories = {};
        const subDirs = readdirSync(catPath)
            .filter(e => isDirectory(join(catPath, e)) && !e.startsWith('.'));

        for (const subName of subDirs) {
            const subPath = join(catPath, subName);
            const subReadme = findReadme(subPath);
            const payloadDirs = walkPayloadDirs(subPath);

            if (payloadDirs.length === 0) {
                console.log(`  📁 ${subName} — no payloads found`);
                continue;
            }

            const payloads = [];
            for (const payloadDir of payloadDirs) {
                const payloadSh = readFileSafe(join(payloadDir, 'payload.sh'));
                if (!payloadSh) continue;

                const meta = parsePayloadHeader(payloadSh);
                const dirName = basename(payloadDir);
                const payloadReadme = findReadme(payloadDir) || subReadme || catReadme;
                const relPath = relative(repoPath, payloadDir);

                payloads.push({
                    name: dirName,
                    title: meta.title || dirName.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    author: meta.author || 'Unknown',
                    description: meta.description || 'No description available.',
                    version: meta.version || null,
                    payloadCategory: meta.category || null,
                    readme: payloadReadme,
                    payloadSource: payloadSh,
                    githubUrl: `https://github.com/${REPO_OWNER}/${REPOS.payloads.name}/tree/${BRANCH}/${relPath}`
                });
            }

            if (payloads.length > 0) {
                subcategories[subName] = {
                    name: subName,
                    displayName: subName.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    payloads
                };
                totalPayloads += payloads.length;
                console.log(`  📁 ${subName} — ${payloads.length} payload(s) ✅`);
            }
        }

        categories[catName] = {
            name: catName,
            displayName: catName.charAt(0).toUpperCase() + catName.slice(1),
            readme: catReadme,
            subcategories
        };
    }

    return { categories, totalPayloads };
}

function processThemes(repoPath) {
    const themesPath = join(repoPath, 'themes');
    if (!existsSync(themesPath)) {
        console.error('❌ themes/ directory not found!');
        return [];
    }

    const themeDirs = readdirSync(themesPath)
        .filter(e => isDirectory(join(themesPath, e)) && !e.startsWith('.'));

    console.log(`\n🎨 Found ${themeDirs.length} themes\n`);

    const themes = [];
    for (const dirName of themeDirs) {
        const themePath = join(themesPath, dirName);
        const readme = resolveReadmeImages(findReadme(themePath), themePath);

        // Try to read theme.json for metadata
        let themeMeta = {};
        const themeJsonPath = join(themePath, 'theme.json');
        if (isFile(themeJsonPath)) {
            try {
                themeMeta = JSON.parse(readFileSafe(themeJsonPath));
            } catch { /* ignore */ }
        }

        // List files in theme dir
        let fileList = [];
        try {
            fileList = readdirSync(themePath).filter(e => !e.startsWith('.'));
        } catch { /* ignore */ }

        const displayName = dirName.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        // Extract author from theme.json or README
        let author = themeMeta.author || '';
        // Filter garbage values
        if (author && /^[-=_.*]+$/.test(author.trim())) author = '';

        if (!author && readme) {
            // Pattern: "Author: Name" or "**Author:** Name" or "AUTHOR : Name" on same line
            const inlineMatch = readme.match(/(?:\*{0,2})Author(?:\*{0,2})\s*[:\-]\s*@?(.+)/i);
            if (inlineMatch) {
                author = inlineMatch[1];
            }
            // Pattern: "## Author\nName" on next line
            if (!author) {
                const blockMatch = readme.match(/^#+\s*Author\s*\n+([^\n#]+)/im);
                if (blockMatch) author = blockMatch[1];
            }
            // Pattern: "Theme by Name" or "Created by Name" or "by @Name"
            if (!author) {
                const byMatch = readme.match(/(?:theme|created|made)\s+by\s+@?([^\n,.(]+)/i);
                if (byMatch) author = byMatch[1];
            }
        }

        // Clean up: strip markdown links [Name](url) -> Name, strip bold/italic markers
        if (author) {
            author = author
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                .replace(/\*+/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
        }

        themes.push({
            name: dirName,
            title: themeMeta.name || themeMeta.theme_name || displayName,
            author: author || 'Unknown',
            description: themeMeta.description || readme ? (readme || '').split('\n').filter(l => l && !l.startsWith('#')).slice(0, 3).join(' ').substring(0, 300) || 'No description available.' : 'No description available.',
            readme: readme,
            themeJson: themeMeta,
            files: fileList,
            githubUrl: `https://github.com/${REPO_OWNER}/${REPOS.themes.name}/tree/${BRANCH}/themes/${dirName}`
        });

        console.log(`  🎨 ${dirName} ✅`);
    }

    return themes;
}

function processRingtones(repoPath) {
    const ringtonesPath = join(repoPath, 'ringtones');
    if (!existsSync(ringtonesPath)) {
        console.error('❌ ringtones/ directory not found!');
        return [];
    }

    const rtttlFiles = readdirSync(ringtonesPath)
        .filter(e => e.endsWith('.rtttl') && isFile(join(ringtonesPath, e)));

    console.log(`\n� Found ${rtttlFiles.length} ringtones\n`);

    const ringtones = [];
    for (const fileName of rtttlFiles) {
        const filePath = join(ringtonesPath, fileName);
        const content = readFileSafe(filePath);
        if (!content) continue;

        // RTTTL format: name:settings:notes
        const parts = content.trim().split(':');
        const rtttlName = parts[0] || fileName.replace('.rtttl', '');
        const settings = parts[1] || '';
        const notes = parts[2] || '';

        const displayName = fileName.replace('.rtttl', '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        ringtones.push({
            name: fileName.replace('.rtttl', ''),
            fileName: fileName,
            title: displayName,
            rtttlName: rtttlName.trim(),
            settings: settings.trim(),
            notes: notes.trim(),
            source: content.trim(),
            size: content.length,
            githubUrl: `https://github.com/${REPO_OWNER}/${REPOS.ringtones.name}/blob/${BRANCH}/ringtones/${fileName}`
        });

        console.log(`  🔔 ${fileName} ✅`);
    }

    return ringtones;
}

async function fetchPullRequests(repoName) {
    console.log(`\n📡 Fetching PRs from ${repoName}...`);

    const pullRequests = [];
    const prStates = ['open', 'closed'];

    for (const state of prStates) {
        let page = 1;
        let hasMore = true;
        while (hasMore) {
            const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${repoName}/pulls?state=${state}&per_page=100&page=${page}`;
            try {
                const res = await fetch(apiUrl, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'pager-payload-library'
                    }
                });
                if (!res.ok) {
                    console.error(`  ⚠️  GitHub API error (${res.status}) for ${state} PRs page ${page}`);
                    break;
                }
                const prs = await res.json();
                if (prs.length === 0) {
                    hasMore = false;
                } else {
                    for (const pr of prs) {
                        pullRequests.push({
                            number: pr.number,
                            title: pr.title,
                            state: pr.state,
                            merged: pr.merged_at !== null,
                            author: pr.user?.login || 'Unknown',
                            authorAvatar: pr.user?.avatar_url || null,
                            authorUrl: pr.user?.html_url || null,
                            body: pr.body || '',
                            createdAt: pr.created_at,
                            updatedAt: pr.updated_at,
                            closedAt: pr.closed_at,
                            mergedAt: pr.merged_at,
                            htmlUrl: pr.html_url,
                            repo: repoName,
                            labels: (pr.labels || []).map(l => ({
                                name: l.name,
                                color: l.color,
                                description: l.description
                            })),
                            comments: pr.comments || 0,
                            draft: pr.draft || false
                        });
                    }
                    console.log(`  📄 ${repoName}: ${prs.length} ${state} PRs (page ${page})`);
                    page++;
                }
            } catch (err) {
                console.error(`  ❌ Failed to fetch ${state} PRs from ${repoName}: ${err.message}`);
                hasMore = false;
            }
        }
    }

    return pullRequests;
}

async function main() {
    console.log('🍍 WiFi Pineapple Pager — Unified Data Fetcher');
    console.log('======================================================\n');

    // Clone all repos
    for (const repo of Object.values(REPOS)) {
        cloneOrUpdateRepo(repo);
    }

    // Process payloads
    console.log('\n══════════════════════════════════════════════════════');
    console.log('📦 Processing Payloads...');
    const { categories, totalPayloads } = processPayloads(REPOS.payloads.clonePath);

    // Process themes
    console.log('\n══════════════════════════════════════════════════════');
    console.log('🎨 Processing Themes...');
    const themes = processThemes(REPOS.themes.clonePath);

    // Process ringtones
    console.log('\n══════════════════════════════════════════════════════');
    console.log('🔔 Processing Ringtones...');
    const ringtones = processRingtones(REPOS.ringtones.clonePath);

    // Fetch PRs from all repos
    console.log('\n══════════════════════════════════════════════════════');
    console.log('🔀 Fetching Pull Requests...');
    let allPRs = [];
    for (const repo of Object.values(REPOS)) {
        const prs = await fetchPullRequests(repo.name);
        allPRs.push(...prs);
    }
    allPRs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Build output
    const data = {
        fetchedAt: new Date().toISOString(),
        categories,
        totalPayloads,
        themes,
        totalThemes: themes.length,
        ringtones,
        totalRingtones: ringtones.length,
        pullRequests: allPRs
    };

    // Summary
    let totalSubs = 0;
    for (const cat of Object.values(data.categories)) {
        totalSubs += Object.keys(cat.subcategories).length;
    }

    console.log(`\n======================================================`);
    console.log(`✅ ${Object.keys(data.categories).length} categories, ${totalSubs} subcategories, ${data.totalPayloads} payloads`);
    console.log(`✅ ${data.totalThemes} themes, ${data.totalRingtones} ringtones`);
    console.log(`✅ ${allPRs.length} pull requests`);

    writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
    console.log(`📄 ${OUTPUT_FILE} written successfully!`);
}

main();
