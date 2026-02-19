#!/usr/bin/env node
/**
 * fetch_data.js
 * Clones the hak5/wifipineapplepager-payloads repo (or uses an existing clone),
 * processes local files, and writes payloads.json.
 * 
 * Usage:
 *   node fetch_data.js                          # Uses /tmp/wifipineapplepager-payloads
 *   node fetch_data.js /path/to/local/clone     # Uses a custom local path
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, basename, relative } from 'path';
import { execSync } from 'child_process';

const REPO_URL = 'https://github.com/hak5/wifipineapplepager-payloads.git';
const DEFAULT_CLONE_PATH = '/tmp/wifipineapplepager-payloads';
const OUTPUT_FILE = 'payloads.json';

const REPO_OWNER = 'hak5';
const REPO_NAME = 'wifipineapplepager-payloads';
const BRANCH = 'master';

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

function findReadme(dirPath) {
    try {
        const entries = readdirSync(dirPath);
        const readme = entries.find(e => e.toLowerCase() === 'readme.md');
        return readme ? readFileSafe(join(dirPath, readme)) : null;
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

async function main() {
    console.log('🍍 WiFi Pineapple Pager Payload Library — Data Fetcher');
    console.log('======================================================\n');

    // Determine repo path
    let repoPath = process.argv[2] || DEFAULT_CLONE_PATH;

    if (!existsSync(join(repoPath, 'library'))) {
        console.log(`📡 Cloning repo to ${repoPath}...`);
        try {
            execSync(`git clone --depth 1 ${REPO_URL} ${repoPath}`, { stdio: 'inherit' });
        } catch (err) {
            console.error('❌ Failed to clone repo. Please clone it manually or pass the path.');
            process.exit(1);
        }
    } else {
        console.log(`📂 Using existing repo at ${repoPath}`);
    }

    const libraryPath = join(repoPath, 'library');
    if (!existsSync(libraryPath)) {
        console.error('❌ library/ directory not found!');
        process.exit(1);
    }

    // Get categories
    const categories = readdirSync(libraryPath)
        .filter(e => isDirectory(join(libraryPath, e)) && !e.startsWith('.'));

    console.log(`\n📂 Found categories: ${categories.join(', ')}\n`);

    const data = { categories: {}, fetchedAt: new Date().toISOString(), totalPayloads: 0 };

    for (const catName of categories) {
        const catPath = join(libraryPath, catName);
        const catReadme = findReadme(catPath);

        console.log(`\n📂 Category: ${catName.toUpperCase()}`);

        const subcategories = {};
        const subDirs = readdirSync(catPath)
            .filter(e => isDirectory(join(catPath, e)) && !e.startsWith('.'));

        for (const subName of subDirs) {
            const subPath = join(catPath, subName);
            const subReadme = findReadme(subPath);

            // Find all payload directories under this subcategory
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

                // Look for README at payload level, subcategory level, or category level
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
                    githubUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}/tree/${BRANCH}/${relPath}`
                });
            }

            if (payloads.length > 0) {
                subcategories[subName] = {
                    name: subName,
                    displayName: subName.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    payloads
                };
                data.totalPayloads += payloads.length;
                console.log(`  📁 ${subName} — ${payloads.length} payload(s) ✅`);
            }
        }

        data.categories[catName] = {
            name: catName,
            displayName: catName.charAt(0).toUpperCase() + catName.slice(1),
            readme: catReadme,
            subcategories
        };
    }

    // ================================================================
    // Fetch Pull Requests from GitHub API
    // ================================================================
    console.log(`\n📡 Fetching pull requests from GitHub API...`);

    const pullRequests = [];
    const prStates = ['open', 'closed'];

    for (const state of prStates) {
        let page = 1;
        let hasMore = true;
        while (hasMore) {
            const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=${state}&per_page=100&page=${page}`;
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
                            labels: (pr.labels || []).map(l => ({
                                name: l.name,
                                color: l.color,
                                description: l.description
                            })),
                            comments: pr.comments || 0,
                            additions: pr.additions || null,
                            deletions: pr.deletions || null,
                            changedFiles: pr.changed_files || null,
                            draft: pr.draft || false
                        });
                    }
                    console.log(`  📄 Fetched ${prs.length} ${state} PRs (page ${page})`);
                    page++;
                }
            } catch (err) {
                console.error(`  ❌ Failed to fetch ${state} PRs: ${err.message}`);
                hasMore = false;
            }
        }
    }

    // Sort PRs by number descending (newest first)
    pullRequests.sort((a, b) => b.number - a.number);
    data.pullRequests = pullRequests;

    console.log(`  ✅ Total PRs fetched: ${pullRequests.length}`);

    // Summary
    let totalSubs = 0;
    for (const cat of Object.values(data.categories)) {
        totalSubs += Object.keys(cat.subcategories).length;
    }

    console.log(`\n======================================================`);
    console.log(`✅ ${Object.keys(data.categories).length} categories, ${totalSubs} subcategories, ${data.totalPayloads} payloads, ${pullRequests.length} PRs`);

    writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
    console.log(`📄 ${OUTPUT_FILE} written successfully!`);
}

main();
