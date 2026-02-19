/**
 * WiFi Pineapple Pager Payload Library — App
 * Client-side logic: loads payloads.json, renders categories/subcategories/cards,
 * handles search, and shows detail modals.
 */

(function () {
    'use strict';

    // ================================================================
    // State
    // ================================================================
    let payloadData = null;
    let activeCategory = null;
    let activeSubcategory = null; // null = "All"
    let searchQuery = '';
    let activeView = 'payloads'; // 'payloads' or 'pullrequests'
    let prFilter = 'all'; // 'all', 'open', 'merged', 'closed'

    // DOM refs
    const categoryTabs = document.getElementById('categoryTabs');
    const subcategoryList = document.getElementById('subcategoryList');
    const payloadGrid = document.getElementById('payloadGrid');
    const gridHeader = document.getElementById('currentSection');
    const gridCount = document.getElementById('gridCount');
    const searchInput = document.getElementById('searchInput');
    const payloadCount = document.getElementById('payloadCount');
    const loadingState = document.getElementById('loadingState');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalContent = document.getElementById('modalContent');
    const modalClose = document.getElementById('modalClose');

    // ================================================================
    // Init
    // ================================================================
    async function init() {
        try {
            const res = await fetch('payloads.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            payloadData = await res.json();
            payloadCount.textContent = `${payloadData.totalPayloads} payloads`;
            renderCategoryTabs();

            // Auto-select first category
            const cats = Object.keys(payloadData.categories);
            if (cats.length > 0) {
                selectCategory(cats[0]);
            }

            // Add Pull Requests tab
            renderPRTab();
        } catch (err) {
            loadingState.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <p>Failed to load payload data.</p>
          <p style="font-size:12px;margin-top:8px;color:var(--text-muted)">
            Run <code>node fetch_data.js</code> to generate payloads.json first.
          </p>
        </div>`;
        }
    }

    // ================================================================
    // Category Tabs
    // ================================================================
    function renderCategoryTabs() {
        categoryTabs.innerHTML = '';
        const icons = { alerts: '🔔', recon: '📡', user: '👤' };

        for (const [key, cat] of Object.entries(payloadData.categories)) {
            const totalPayloads = Object.values(cat.subcategories)
                .reduce((acc, sub) => acc + sub.payloads.length, 0);

            const tab = document.createElement('button');
            tab.className = 'cat-tab';
            tab.dataset.cat = key;
            tab.innerHTML = `
        <span>${icons[key] || '📂'}</span>
        <span>${cat.displayName}</span>
        <span class="tab-count">${totalPayloads}</span>
      `;
            tab.addEventListener('click', () => selectCategory(key));
            categoryTabs.appendChild(tab);
        }
    }

    function selectCategory(catKey) {
        activeView = 'payloads';
        activeCategory = catKey;
        activeSubcategory = null;

        // Update tab active states
        document.querySelectorAll('.cat-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.cat === catKey);
        });

        const sidebarHeader = document.querySelector('.sidebar-header h3');
        if (sidebarHeader) sidebarHeader.textContent = 'Subcategories';

        renderSubcategories();
        renderPayloads();
    }

    // ================================================================
    // Subcategories
    // ================================================================
    function renderSubcategories() {
        subcategoryList.innerHTML = '';
        if (!activeCategory || !payloadData) return;

        const cat = payloadData.categories[activeCategory];
        const subs = Object.entries(cat.subcategories);

        // "All" item
        const allPayloads = subs.reduce((acc, [, sub]) => acc + sub.payloads.length, 0);
        const allItem = createSubcategoryItem('All', allPayloads, null, true);
        allItem.classList.add('sub-all-item');
        subcategoryList.appendChild(allItem);

        // Individual subcategories
        for (const [key, sub] of subs) {
            const item = createSubcategoryItem(sub.displayName, sub.payloads.length, key, false);
            subcategoryList.appendChild(item);
        }
    }

    function createSubcategoryItem(label, count, key, isAll) {
        const li = document.createElement('li');
        li.className = 'subcategory-item' + (isAll && !activeSubcategory ? ' active' : '');
        if (!isAll && activeSubcategory === key) li.classList.add('active');
        li.innerHTML = `<span>${label}</span><span class="sub-count">${count}</span>`;
        li.addEventListener('click', () => {
            activeSubcategory = isAll ? null : key;
            // Update active states
            document.querySelectorAll('.subcategory-item').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            renderPayloads();
        });
        return li;
    }

    // ================================================================
    // Payload Grid
    // ================================================================
    function getVisiblePayloads() {
        if (!activeCategory || !payloadData) return [];

        const cat = payloadData.categories[activeCategory];
        let payloads = [];

        if (activeSubcategory) {
            const sub = cat.subcategories[activeSubcategory];
            payloads = sub ? sub.payloads.map(p => ({ ...p, subcategory: activeSubcategory })) : [];
        } else {
            for (const [subKey, sub] of Object.entries(cat.subcategories)) {
                payloads.push(...sub.payloads.map(p => ({ ...p, subcategory: subKey })));
            }
        }

        // Apply search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            payloads = payloads.filter(p =>
                p.title.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q) ||
                p.author.toLowerCase().includes(q) ||
                p.name.toLowerCase().includes(q) ||
                (p.subcategory && p.subcategory.toLowerCase().includes(q))
            );
        }

        return payloads;
    }

    function renderPayloads() {
        const payloads = getVisiblePayloads();

        // Update header
        const cat = payloadData.categories[activeCategory];
        if (activeSubcategory) {
            const sub = cat.subcategories[activeSubcategory];
            gridHeader.textContent = sub ? sub.displayName : activeSubcategory;
        } else {
            gridHeader.textContent = cat.displayName + ' — All Payloads';
        }
        gridCount.textContent = `${payloads.length} payload${payloads.length !== 1 ? 's' : ''}`;

        // Render cards
        payloadGrid.innerHTML = '';

        if (payloads.length === 0) {
            payloadGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p>${searchQuery ? 'No payloads match your search.' : 'No payloads in this category.'}</p>
        </div>`;
            return;
        }

        for (const payload of payloads) {
            payloadGrid.appendChild(createPayloadCard(payload));
        }
    }

    function createPayloadCard(payload) {
        const card = document.createElement('div');
        card.className = 'payload-card';
        card.dataset.cat = activeCategory;

        const authorInitial = payload.author.charAt(0).toUpperCase();

        card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${escapeHtml(payload.title)}</span>
        ${payload.version ? `<span class="card-version">v${escapeHtml(payload.version)}</span>` : ''}
      </div>
      <p class="card-description">${escapeHtml(payload.description)}</p>
      <div class="card-footer">
        <div class="card-author">
          <span class="card-author-icon">${authorInitial}</span>
          <span>${escapeHtml(payload.author)}</span>
        </div>
        <div class="card-tags">
          ${payload.readme ? '<span class="card-tag tag-has-readme">README</span>' : ''}
          <span class="card-tag tag-has-source">SRC</span>
        </div>
      </div>
    `;

        card.addEventListener('click', () => openModal(payload));
        return card;
    }

    // ================================================================
    // Modal
    // ================================================================
    function openModal(payload) {
        let activeTab = payload.readme ? 'readme' : 'source';

        function render() {
            modalContent.innerHTML = `
        <div class="modal-header">
          <h2 class="modal-title">${escapeHtml(payload.title)}</h2>
          <div class="modal-meta">
            <span class="modal-meta-item">👤 <strong>${escapeHtml(payload.author)}</strong></span>
            ${payload.version ? `<span class="modal-meta-item">📦 v${escapeHtml(payload.version)}</span>` : ''}
            ${payload.payloadCategory ? `<span class="modal-meta-item">🏷️ ${escapeHtml(payload.payloadCategory)}</span>` : ''}
            <span class="modal-meta-item">
              <a href="${payload.githubUrl}" target="_blank" rel="noopener">View on GitHub →</a>
            </span>
          </div>
        </div>

        <div class="modal-tabs">
          ${payload.readme ? `<button class="modal-tab ${activeTab === 'readme' ? 'active' : ''}" data-tab="readme">📖 README</button>` : ''}
          <button class="modal-tab ${activeTab === 'source' ? 'active' : ''}" data-tab="source">💻 Source Code</button>
          <button class="modal-tab ${activeTab === 'description' ? 'active' : ''}" data-tab="description">📝 Description</button>
        </div>

        <div class="modal-body" id="modalBody">
          ${activeTab === 'readme' ? renderReadme(payload.readme) : ''}
          ${activeTab === 'source' ? renderSource(payload) : ''}
          ${activeTab === 'description' ? renderDescription(payload) : ''}
        </div>
      `;

            // Tab click handlers
            modalContent.querySelectorAll('.modal-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    activeTab = tab.dataset.tab;
                    render();
                });
            });

            // Copy button
            const copyBtn = modalContent.querySelector('.copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(payload.payloadSource).then(() => {
                        copyBtn.textContent = '✓ Copied!';
                        copyBtn.classList.add('copied');
                        setTimeout(() => {
                            copyBtn.textContent = 'Copy';
                            copyBtn.classList.remove('copied');
                        }, 2000);
                    });
                });
            }
        }

        render();
        modalOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modalOverlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    function renderReadme(readme) {
        return `<div>${simpleMarkdown(readme)}</div>`;
    }

    function renderSource(payload) {
        return `
      <div class="source-code-view">
        <div class="source-code-header">
          <span class="source-code-filename">payload.sh</span>
          <button class="copy-btn">Copy</button>
        </div>
        <pre><code>${escapeHtml(payload.payloadSource)}</code></pre>
      </div>
    `;
    }

    function renderDescription(payload) {
        return `
      <h3 style="color:var(--text-primary);margin-bottom:12px">Description</h3>
      <p>${escapeHtml(payload.description)}</p>
      ${payload.payloadCategory ? `<p style="margin-top:12px"><strong>Category:</strong> ${escapeHtml(payload.payloadCategory)}</p>` : ''}
    `;
    }

    // ================================================================
    // Simple Markdown Renderer
    // ================================================================
    function simpleMarkdown(md) {
        if (!md) return '';
        let html = escapeHtml(md);

        // Code blocks
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
            return `<pre><code>${code.trim()}</code></pre>`;
        });

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Headers
        html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Bold and italic
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // Tables
        html = html.replace(/^\|(.+)\|$/gm, (match) => {
            const cells = match.split('|').filter(c => c.trim());
            if (cells.every(c => /^[\s-:]+$/.test(c))) {
                return '<!-- table separator -->';
            }
            return match;
        });

        // Convert table rows
        const lines = html.split('\n');
        let inTable = false;
        let tableHtml = '';
        const result = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('|') && line.endsWith('|')) {
                if (!inTable) {
                    inTable = true;
                    tableHtml = '<table>';
                }
                if (line === '&lt;!-- table separator --&gt;' || line === '<!-- table separator -->') continue;
                const cells = line.split('|').filter(c => c.trim());
                const tag = !tableHtml.includes('<td') ? 'th' : 'td';
                tableHtml += '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
            } else {
                if (inTable) {
                    tableHtml += '</table>';
                    result.push(tableHtml);
                    tableHtml = '';
                    inTable = false;
                }
                result.push(line);
            }
        }
        if (inTable) {
            tableHtml += '</table>';
            result.push(tableHtml);
        }
        html = result.join('\n');

        // Blockquotes
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

        // Horizontal rules  
        html = html.replace(/^---$/gm, '<hr>');

        // Unordered lists
        html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

        // Ordered lists
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

        // Paragraphs (lines that aren't already wrapped in tags)
        html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');

        // Clean up empty paragraphs
        html = html.replace(/<p>\s*<\/p>/g, '');

        return html;
    }

    // ================================================================
    // Pull Requests
    // ================================================================
    function renderPRTab() {
        const prCount = payloadData.pullRequests ? payloadData.pullRequests.length : 0;
        const tab = document.createElement('button');
        tab.className = 'cat-tab';
        tab.dataset.cat = '__pullrequests__';
        tab.innerHTML = `
        <span>🔀</span>
        <span>Pull Requests</span>
        <span class="tab-count">${prCount}</span>
      `;
        tab.addEventListener('click', () => selectPRView());
        categoryTabs.appendChild(tab);
    }

    function selectPRView() {
        activeView = 'pullrequests';
        activeCategory = null;
        activeSubcategory = null;
        prFilter = 'all';

        document.querySelectorAll('.cat-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.cat === '__pullrequests__');
        });

        renderPRSidebar();
        renderPullRequests();
    }

    function renderPRSidebar() {
        subcategoryList.innerHTML = '';
        if (!payloadData || !payloadData.pullRequests) return;

        const prs = payloadData.pullRequests;
        const counts = {
            all: prs.length,
            open: prs.filter(p => p.state === 'open').length,
            merged: prs.filter(p => p.merged).length,
            closed: prs.filter(p => p.state === 'closed' && !p.merged).length
        };

        const filters = [
            { key: 'all', label: 'All', icon: '' },
            { key: 'open', label: 'Open', icon: '' },
            { key: 'merged', label: 'Merged', icon: '' },
            { key: 'closed', label: 'Closed', icon: '' }
        ];

        const sidebarHeader = document.querySelector('.sidebar-header h3');
        if (sidebarHeader) sidebarHeader.textContent = 'Filter';

        for (const f of filters) {
            const li = document.createElement('li');
            li.className = 'subcategory-item' + (prFilter === f.key ? ' active' : '');
            if (f.key === 'all') li.classList.add('sub-all-item');
            li.innerHTML = `<span>${f.label}</span><span class="sub-count">${counts[f.key]}</span>`;
            li.addEventListener('click', () => {
                prFilter = f.key;
                document.querySelectorAll('.subcategory-item').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                renderPullRequests();
            });
            subcategoryList.appendChild(li);
        }
    }

    function getFilteredPRs() {
        if (!payloadData || !payloadData.pullRequests) return [];
        let prs = payloadData.pullRequests;

        if (prFilter === 'open') prs = prs.filter(p => p.state === 'open');
        else if (prFilter === 'merged') prs = prs.filter(p => p.merged);
        else if (prFilter === 'closed') prs = prs.filter(p => p.state === 'closed' && !p.merged);

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            prs = prs.filter(p =>
                p.title.toLowerCase().includes(q) ||
                p.author.toLowerCase().includes(q) ||
                p.body.toLowerCase().includes(q) ||
                String(p.number).includes(q) ||
                p.labels.some(l => l.name.toLowerCase().includes(q))
            );
        }

        return prs;
    }

    function renderPullRequests() {
        const prs = getFilteredPRs();

        gridHeader.textContent = 'Pull Requests';
        gridCount.textContent = `${prs.length} PR${prs.length !== 1 ? 's' : ''}`;

        payloadGrid.innerHTML = '';

        if (prs.length === 0) {
            payloadGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔀</div>
          <p>${searchQuery ? 'No pull requests match your search.' : 'No pull requests found.'}</p>
        </div>`;
            return;
        }

        for (const pr of prs) {
            payloadGrid.appendChild(createPRCard(pr));
        }
    }

    function getPRStateInfo(pr) {
        if (pr.merged) return { label: 'Merged', cssClass: 'pr-merged', icon: '🟣' };
        if (pr.state === 'open') return { label: 'Open', cssClass: 'pr-open', icon: '🟢' };
        return { label: 'Closed', cssClass: 'pr-closed', icon: '🔴' };
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function createPRCard(pr) {
        const card = document.createElement('div');
        card.className = 'payload-card pr-card';
        card.dataset.cat = '__pullrequests__';

        const stateInfo = getPRStateInfo(pr);
        const labelsHtml = pr.labels.map(l =>
            `<span class="pr-label" style="background:#${l.color}22;color:#${l.color};border:1px solid #${l.color}44">${escapeHtml(l.name)}</span>`
        ).join('');

        card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${escapeHtml(pr.title)}</span>
        <span class="pr-state-badge ${stateInfo.cssClass}">${stateInfo.icon} ${stateInfo.label}</span>
      </div>
      <p class="card-description">#${pr.number} · opened ${formatDate(pr.createdAt)}${pr.mergedAt ? ' · merged ' + formatDate(pr.mergedAt) : ''}${pr.closedAt && !pr.merged ? ' · closed ' + formatDate(pr.closedAt) : ''}</p>
      <div class="pr-labels-row">${labelsHtml}</div>
      <div class="card-footer">
        <div class="card-author">
          ${pr.authorAvatar ? `<img class="pr-avatar" src="${pr.authorAvatar}" alt="${escapeHtml(pr.author)}" width="16" height="16">` : `<span class="card-author-icon">${pr.author.charAt(0).toUpperCase()}</span>`}
          <span>${escapeHtml(pr.author)}</span>
        </div>
        <div class="card-tags">
          ${pr.comments > 0 ? `<span class="card-tag tag-has-readme">💬 ${pr.comments}</span>` : ''}
          ${pr.draft ? '<span class="card-tag tag-draft">DRAFT</span>' : ''}
        </div>
      </div>
    `;

        card.addEventListener('click', () => openPRModal(pr));
        return card;
    }

    function openPRModal(pr) {
        const stateInfo = getPRStateInfo(pr);

        modalContent.innerHTML = `
        <div class="modal-header">
          <h2 class="modal-title">${escapeHtml(pr.title)}</h2>
          <div class="modal-meta">
            <span class="modal-meta-item"><span class="pr-state-badge ${stateInfo.cssClass}">${stateInfo.icon} ${stateInfo.label}</span></span>
            <span class="modal-meta-item">👤 <strong>${escapeHtml(pr.author)}</strong></span>
            <span class="modal-meta-item">#${pr.number}</span>
            <span class="modal-meta-item">
              <a href="${pr.htmlUrl}" target="_blank" rel="noopener">View on GitHub →</a>
            </span>
          </div>
          <div class="pr-meta-dates" style="margin-top:10px;font-size:12px;color:var(--text-muted);display:flex;gap:16px;flex-wrap:wrap">
            <span>Created: ${formatDate(pr.createdAt)}</span>
            ${pr.mergedAt ? `<span>Merged: ${formatDate(pr.mergedAt)}</span>` : ''}
            ${pr.closedAt && !pr.merged ? `<span>Closed: ${formatDate(pr.closedAt)}</span>` : ''}
            ${pr.comments > 0 ? `<span>💬 ${pr.comments} comment${pr.comments !== 1 ? 's' : ''}</span>` : ''}
          </div>
          ${pr.labels.length > 0 ? `<div class="pr-labels-row" style="margin-top:10px">${pr.labels.map(l => `<span class="pr-label" style="background:#${l.color}22;color:#${l.color};border:1px solid #${l.color}44">${escapeHtml(l.name)}</span>`).join('')}</div>` : ''}
        </div>

        <div class="modal-body">
          ${pr.body ? simpleMarkdown(pr.body) : '<p style="color:var(--text-muted)">No description provided.</p>'}
        </div>
      `;

        modalOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    // ================================================================
    // Search
    // ================================================================
    function handleSearch() {
        searchQuery = searchInput.value.trim();
        if (activeView === 'pullrequests') {
            renderPullRequests();
        } else {
            renderPayloads();
        }
    }

    // ================================================================
    // Helpers
    // ================================================================
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ================================================================
    // Event Listeners
    // ================================================================
    searchInput.addEventListener('input', debounce(handleSearch, 200));

    // Keyboard shortcut: "/" to focus search
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
        if (e.key === 'Escape') {
            if (modalOverlay.classList.contains('open')) {
                closeModal();
            } else {
                searchInput.blur();
                searchInput.value = '';
                searchQuery = '';
                renderPayloads();
            }
        }
    });

    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    function debounce(fn, ms) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    }

    // ================================================================
    // Boot
    // ================================================================
    init();
})();
