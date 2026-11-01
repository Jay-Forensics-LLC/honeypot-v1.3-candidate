'use strict';

(() => {
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const titles = {overview: 'Overview', evidence: 'Evidence & analysis', telemetry: 'Telemetry', honeypot: 'Honeypot', integrations: 'Integrations', settings: 'Settings'};
    const modules = {
        spiderfoot: ['SpiderFoot', 'OSINT', 'Explore entities and observed relationships from CSV or GEXF reports.', 'link'],
        'recon-ng': ['Recon-ng', 'OSINT', 'Bring a supported workspace export into your evidence workspace.', 'search'],
        bbot: ['BBOT', 'OSINT', 'Review entities from an offline JSONL scan report.', 'search'],
        nmap: ['Nmap', 'Assessment', 'Import service-discovery results for assets you are authorized to assess.', 'pulse'],
        nuclei: ['Nuclei', 'Assessment', 'Review scoped template findings from an existing JSONL report.', 'shield'],
        cloudfox: ['CloudFox', 'Cloud', 'Import an approved, versioned cloud assessment report.', 'folder'],
        bloodhound: ['BloodHound', 'Identity', 'Review aggregate summaries from an authorized isolated lab.', 'link'],
        awareness: ['Security awareness', 'Awareness', 'Review aggregate training metrics without employee-level records.', 'shield'],
        'mock-ti': ['Threat intelligence', 'Intelligence', 'Explore six providers using local mock responses. No external queries.', 'spark'],
        forensics: ['Forensic handoff', 'Forensics', 'Preserve a hash-linked copy for analysis in a local offline tool.', 'file'],
        sentinel: ['Sentinel Forensics', 'Forensics', 'Bring a verified, completed Sentinel case into HoneyTrace.', 'folder'],
        imazing: ['Backup metadata', 'Forensics', 'Inventory metadata from a finished, unencrypted Apple or iMazing backup.', 'file']
    };
    const genericModules = new Set(['spiderfoot', 'recon-ng', 'bbot', 'nmap', 'nuclei', 'cloudfox', 'bloodhound', 'awareness']);
    const MAX_FILE = 8 * 1024 * 1024;
    const ui = {token: '', data: null, page: 'overview', refreshing: false, filters: {query: '', plugin: '', assessment: ''}};

    function E(tag, props = {}, ...children) {
        const element = document.createElement(tag);
        for (const [key, value] of Object.entries(props)) {
            if (value === undefined || value === null || key === 'value') continue;
            if (key === 'class') element.className = value;
            else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2).toLowerCase(), value);
            else if (key in element && !key.startsWith('aria-') && key !== 'role') element[key] = value;
            else element.setAttribute(key, String(value));
        }
        children.flat(Infinity).forEach(child => {
            if (child !== null && child !== undefined && child !== false) element.append(child instanceof Node ? child : document.createTextNode(String(child)));
        });
        if ('value' in props) element.value = props.value;
        return element;
    }

    function icon(name, className = 'nav-icon') {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        svg.setAttribute('class', className);
        svg.setAttribute('aria-hidden', 'true');
        use.setAttribute('href', `#i-${name}`);
        svg.append(use);
        return svg;
    }

    function button(label, callback, variant = 'secondary', iconName = null, props = {}) {
        return E('button', {type: 'button', class: `button ${variant}`, onClick: callback, ...props}, iconName ? icon(iconName) : null, E('span', {}, label));
    }

    function badge(label, tone = 'neutral') { return E('span', {class: `status-badge ${tone}`}, label); }
    function display(value, fallback = 'Not available') { return value === null || value === undefined || value === '' ? fallback : String(value); }
    function count(value) { return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—'; }
    function human(value) { return display(value, 'Unknown').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()); }
    function formatDate(value, short = false) {
        if (!value || Number.isNaN(Date.parse(value))) return 'Time not recorded';
        return new Intl.DateTimeFormat(undefined, short ? {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'} : {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value));
    }
    function moduleInfo(id) { return modules[id] || [human(id), 'Optional module', 'Offline report integration.', 'plug']; }
    function enabled(id) { return !!ui.data?.policy?.enabled && (ui.data.policy.plugins || []).includes(id); }
    function announce(message) { $('#announcer').textContent = message; }

    function toast(message, tone = 'success') {
        const item = E('div', {class: `toast ${tone}`, role: tone === 'error' ? 'alert' : 'status'},
            icon(tone === 'error' ? 'info' : 'check'), E('span', {}, message),
            button('Dismiss', () => item.remove(), 'ghost small', 'close', {'aria-label': 'Dismiss notification'}));
        $('#toasts').append(item);
        setTimeout(() => item.remove(), tone === 'error' ? 12000 : 7000);
    }

    function notice(message, tone = 'info', action = null) {
        return E('div', {class: `notice ${tone}`}, icon('info'), E('div', {}, E('p', {}, message), action));
    }

    function empty(title, message, action = null, glyph = 'folder') {
        return E('div', {class: 'empty-state'}, E('span', {class: 'empty-icon'}, icon(glyph)),
            E('h3', {class: 'empty-title'}, title), E('p', {class: 'muted'}, message), action);
    }

    function card(title, subtitle, body, extra = null) {
        return E('section', {class: 'card'}, E('div', {class: 'card-header'},
            E('div', {}, E('h2', {class: 'card-title'}, title), subtitle ? E('p', {class: 'muted'}, subtitle) : null), extra),
            E('div', {class: 'card-body'}, body));
    }

    async function api(path, body) {
        let response;
        try {
            response = await fetch(path, {method: body === undefined ? 'GET' : 'POST', cache: 'no-store', credentials: 'omit',
                headers: {Authorization: `Bearer ${ui.token}`, ...(body === undefined ? {} : {'Content-Type': 'application/json'})},
                ...(body === undefined ? {} : {body: JSON.stringify(body)})});
        } catch (_) {
            throw new Error('The local workspace is not reachable. Check that the dashboard is running, then try again.');
        }
        let result;
        try { result = await response.json(); } catch (_) { throw new Error('The workspace returned an unreadable response. Try refreshing.'); }
        if (response.status === 401) {
            disconnect('Your session link is missing or expired. Open the latest link printed by the dashboard.');
            throw new Error('Reconnect with your current session link.');
        }
        if (!response.ok) throw new Error(result.error || 'That operation could not be completed. Check the input and try again.');
        return result;
    }

    function disconnect(message = '') {
        ui.token = '';
        ui.data = null;
        $('#app-shell').hidden = true;
        $('#auth-screen').hidden = false;
        $('#access-token').value = '';
        $('#auth-message').textContent = message;
        for (const modal of $$('dialog[open]')) modal.close();
    }

    async function connect(token) {
        if (!token.trim()) return;
        ui.token = token.trim();
        const form = $('#auth-form');
        setBusy(form, true);
        $('#auth-message').textContent = 'Opening your workspace…';
        try {
            ui.data = await api('/api/state');
            $('#access-token').value = '';
            $('#auth-screen').hidden = true;
            $('#app-shell').hidden = false;
            navigate(ui.page);
            updateRefreshTime();
        } catch (error) { $('#auth-message').textContent = error.message; }
        finally { setBusy(form, false); }
    }

    async function refresh(showToast = false) {
        if (ui.refreshing || !ui.token) return;
        ui.refreshing = true;
        $('#refresh-button').disabled = true;
        $('#refresh-button').classList.add('refreshing');
        try {
            ui.data = await api('/api/state');
            renderPage();
            updateRefreshTime();
            if (showToast) toast('Workspace updated.');
        } catch (error) { if (ui.token) toast(error.message, 'error'); }
        finally {
            ui.refreshing = false;
            $('#refresh-button').disabled = false;
            $('#refresh-button').classList.remove('refreshing');
        }
    }

    function updateRefreshTime() {
        $('#refresh-time').textContent = `Updated ${new Intl.DateTimeFormat(undefined, {hour: 'numeric', minute: '2-digit'}).format(new Date())}`;
    }

    function navigate(page, focus = true) {
        if (!(page in titles)) page = 'overview';
        ui.page = page;
        $$('.nav-button[data-page]').forEach(item => {
            const active = item.dataset.page === page;
            item.classList.toggle('active', active);
            if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
        });
        $('#page-label').textContent = titles[page];
        document.title = `${titles[page]} · HoneyTrace`;
        closeNavigation();
        renderPage();
        if (focus) { $('#main').focus({preventScroll: true}); window.scrollTo({top: 0, behavior: 'instant'}); }
        announce(titles[page]);
    }

    function pageHeader(title, subtitle, ...actions) {
        return E('div', {class: 'page-heading'}, E('div', {class: 'header-copy'}, E('p', {class: 'eyebrow'}, 'HONEYTRACE WORKSPACE'),
            E('h1', {}, title), E('p', {class: 'lead'}, subtitle)), E('div', {class: 'actions'}, actions));
    }

    function renderPage() {
        if (!ui.data) return;
        const page = E('div', {class: `page page-${ui.page}`});
        const renderer = {overview: renderOverview, evidence: renderEvidence, telemetry: renderTelemetry, honeypot: renderHoneypot, integrations: renderIntegrations, settings: renderSettings}[ui.page];
        renderer(page);
        for (const error of (ui.data.errors || []).slice(0, 3).reverse()) {
            const action = error.module === 'policy' && ui.page !== 'settings' ? button('Open settings', () => navigate('settings'), 'ghost small', 'settings') : null;
            page.insertBefore(notice(error.message || 'Some workspace data is unavailable. Try refreshing.', 'warning', action), page.children[1] || null);
        }
        $('#main').replaceChildren(page);
    }

    function renderOverview(page) {
        const data = ui.data;
        page.append(pageHeader('Your security, in perspective.', 'A single place to connect observations, understand findings and preserve what matters.',
            button('Import evidence', () => openImport(), 'primary', 'upload')));
        const core = E('section', {class: 'core-card'}, E('div', {class: 'core-card-copy'},
            badge('FREE HONEYPOT CORE', 'accent'), E('h2', {}, 'Start with visibility.\nBuild understanding.'),
            E('p', {}, 'Decoy services, network observations and preserved evidence. Your free foundation for a more complete security picture.'),
            E('div', {class: 'actions'}, button('View honeypot', () => navigate('honeypot'), 'secondary', 'arrow'),
                E('span', {class: 'core-caption'}, 'Observe · Reconcile · Preserve'))), E('div', {class: 'core-art', 'aria-hidden': 'true'}, E('span', {}, 'HT'), E('span', {class: 'core-art-slash'}, '//'), icon('shield')));
        const started = [!!data.policy?.enabled, (data.metrics?.imports || 0) > 0, (data.metrics?.findings || 0) > 0];
        const steps = E('div', {class: 'steps'},
            step(1, 'Choose your tools', 'Enable only the offline modules you need.', started[0], () => navigate('settings')),
            step(2, 'Bring in evidence', 'Import a report or a completed case.', started[1], () => openImport()),
            step(3, 'Review & preserve', 'Explore findings and their source references.', started[2], () => navigate('evidence')));
        page.append(E('div', {class: 'hero-grid'}, core, card('A simple way to get started', 'Your next step is always within reach.', steps,
            button('Guide', () => openHelp(), 'ghost small', 'help'))));
        page.append(E('div', {class: 'stats-grid'},
            stat('Evidence imports', data.store_status === 'disabled' ? null : data.metrics?.imports, data.store_status === 'disabled' ? 'Hidden while offline modules are disabled' : 'Source files with retained provenance', 'folder'),
            stat('Normalized findings', data.store_status === 'disabled' ? null : data.metrics?.findings, data.store_status === 'disabled' ? 'Re-enable modules to view preserved findings' : 'Observations ready for your review', 'search'),
            stat('Enabled modules', data.metrics?.integrations_enabled, 'Optional tools in this workspace', 'plug')));
        const history = importList((data.imports || []).slice(0, 4));
        const recent = card('Recent evidence', 'Every import keeps a reference to its source.', history,
            button('View all', () => navigate('evidence'), 'ghost small', 'arrow'));
        const modulesCard = card('A connected toolkit', 'Start small. Add capabilities as you need them.',
            E('div', {class: 'list'}, miniCapability('Forensic analysis', 'Completed Sentinel cases and backup metadata', 'folder', () => openImport('sentinel')),
                miniCapability('Security assessments', 'Nmap and Nuclei report review', 'shield', () => navigate('integrations')),
                miniCapability('Threat intelligence', 'Local mock-provider workflows', 'spark', () => openEnrichment())),
            button('Explore', () => navigate('integrations'), 'ghost small', 'arrow'));
        page.append(E('div', {class: 'section-grid'}, recent, modulesCard));
        page.append(E('div', {class: 'connection-bar'}, icon('lock'), E('p', {}, 'Your workspace is local. Optional integrations are off until you enable them.'),
            button('Workspace settings', () => navigate('settings'), 'ghost small', 'arrow')));
    }

    function step(number, title, copy, complete, callback) {
        return E('button', {type: 'button', class: `step${complete ? ' complete' : ''}`, onClick: callback},
            E('span', {class: 'step-number'}, complete ? icon('check') : String(number).padStart(2, '0')),
            E('span', {}, E('strong', {}, title), E('span', {class: 'muted'}, copy)), icon('chevron'));
    }

    function stat(label, value, subtitle, glyph) {
        return E('section', {class: 'stat-card'}, E('div', {class: 'stat-label'}, E('span', {}, label), icon(glyph)),
            E('p', {class: 'stat-number'}, count(value)), E('p', {class: 'muted'}, subtitle));
    }

    function miniCapability(title, copy, glyph, callback) {
        return E('button', {type: 'button', class: 'list-row capability-row', onClick: callback},
            E('span', {class: 'module-icon'}, icon(glyph)), E('span', {class: 'row-main'}, E('strong', {}, title), E('span', {class: 'muted'}, copy)), icon('chevron'));
    }

    function importList(rows) {
        if (ui.data.store_status === 'disabled') return empty('Offline imports are off', 'Disabling modules hides their results and keeps your evidence. Re-enable the modules to see their preserved findings.',
            button('Choose modules', () => navigate('settings'), 'secondary', 'settings'));
        if (!rows.length) return empty('Your evidence starts here', 'Import a report to begin building a clear, traceable view of your data.',
            button('Import your first report', () => openImport(), 'secondary', 'upload'));
        return E('div', {class: 'list'}, rows.map(row => E('div', {class: 'list-row'},
            E('span', {class: 'module-icon'}, icon(moduleInfo(row.plugin_id)[3])),
            E('div', {class: 'row-main'}, E('strong', {}, moduleInfo(row.plugin_id)[0]),
                E('span', {class: 'row-meta'}, `${String(row.format || '').toUpperCase()} · ${formatDate(row.imported_at, true)}`)),
            E('div', {class: 'row-end'}, E('strong', {}, `${count(row.records)} records`), badge('Preserved', 'success')))));
    }

    function renderEvidence(page) {
        const data = ui.data;
        page.append(pageHeader('Evidence & analysis', 'Review observations, follow their provenance and export a clear record.',
            button('Export findings', exportFindings, 'secondary', 'download', {disabled: !(data.findings || []).length, title: !(data.findings || []).length ? 'Import evidence before exporting findings.' : 'Download normalized findings as JSON'}),
            button('Import evidence', () => openImport(), 'primary', 'upload')));
        const rows = data.findings || [];
        const query = E('input', {type: 'search', placeholder: 'Search indicators, tools or finding IDs…', 'aria-label': 'Search findings', value: ui.filters.query});
        const tool = E('select', {'aria-label': 'Filter by source tool', value: ui.filters.plugin}, E('option', {value: ''}, 'All source tools'),
            [...new Set(rows.map(row => row.source_tool))].sort().map(id => E('option', {value: id}, moduleInfo(id)[0])));
        const assessment = E('select', {'aria-label': 'Filter by assessment', value: ui.filters.assessment}, E('option', {value: ''}, 'All assessments'),
            [...new Set(rows.map(row => row.assessment))].sort().map(value => E('option', {value}, human(value))));
        const body = E('div');
        const results = E('p', {class: 'result-count', role: 'status'});
        const draw = () => {
            const q = ui.filters.query.trim().toLowerCase();
            const filtered = rows.filter(row => (!q || [row.indicator_value, row.source_tool, row.finding_id, row.source_record_id].some(value => String(value || '').toLowerCase().includes(q))) &&
                (!ui.filters.plugin || row.source_tool === ui.filters.plugin) && (!ui.filters.assessment || row.assessment === ui.filters.assessment));
            results.textContent = `${count(filtered.length)} ${filtered.length === 1 ? 'finding' : 'findings'}${data.findings_truncated ? ' shown from a bounded view' : ''}`;
            if (data.store_status === 'disabled') body.replaceChildren(empty('Enable modules to view evidence', 'Disabling imports keeps your evidence. Re-enable the modules to see their preserved results.', button('Open settings', () => navigate('settings'), 'primary', 'settings')));
            else if (!rows.length) body.replaceChildren(empty('Nothing to review yet', 'Import an offline report or completed case. Your original source stays preserved in the private store.', button('Import evidence', () => openImport(), 'primary', 'upload')));
            else if (!filtered.length) body.replaceChildren(empty('No matching findings', 'Try another search or clear the filters.', button('Clear filters', () => {ui.filters = {query: '', plugin: '', assessment: ''}; renderPage();}, 'secondary', 'refresh'), 'search'));
            else body.replaceChildren(findingsTable(filtered));
        };
        query.addEventListener('input', () => {ui.filters.query = query.value; draw();});
        tool.addEventListener('change', () => {ui.filters.plugin = tool.value; draw();});
        assessment.addEventListener('change', () => {ui.filters.assessment = assessment.value; draw();});
        page.append(E('section', {class: 'card'}, E('div', {class: 'toolbar'}, E('div', {class: 'search-wrap'}, icon('search', 'search-icon'), query), tool, assessment),
            E('div', {class: 'card-body'}, E('div', {class: 'section-heading'}, E('h2', {class: 'card-title'}, 'Findings'), results), body)));
        page.append(card('Import history', 'Preserved sources behind this workspace.', importList(data.imports || [])));
        page.append(notice('Findings are observations and review leads. Shared infrastructure or similar indicators do not, on their own, establish identity, ownership or compromise.'));
        draw();
    }

    function findingsTable(rows) {
        const table = E('table', {class: 'data-table'}, E('thead', {}, E('tr', {}, ['Indicator / observation', 'Source', 'Assessment', 'Collected', ''].map(label => E('th', {scope: 'col'}, label)))),
            E('tbody', {}, rows.map(row => E('tr', {},
                E('td', {}, E('div', {class: 'indicator-cell'}, E('span', {class: 'pill'}, human(row.indicator_type)), E('strong', {class: 'indicator-value', title: row.indicator_value}, row.indicator_value))),
                E('td', {}, moduleInfo(row.source_tool)[0]),
                E('td', {}, badge(human(row.assessment), row.assessment === 'possible' ? 'warning' : 'neutral')),
                E('td', {class: 'muted', title: display(row.collected_at)}, formatDate(row.collected_at, true)),
                E('td', {class: 'table-actions'}, button('Review provenance', () => openFinding(row), 'ghost small', 'arrow'))))));
        return E('div', {class: 'table-wrap'}, table);
    }

    function keyValue(label, value, mono = false) {
        return E('div', {class: 'key-value'}, E('dt', {}, label), E('dd', {class: mono ? 'hash-value' : ''}, display(value, 'Not recorded')));
    }

    function openFinding(row) {
        const drawer = $('#finding-drawer');
        drawer.replaceChildren(E('div', {class: 'drawer-header'}, E('div', {}, E('p', {class: 'eyebrow'}, 'OBSERVATION DETAILS'), E('h2', {id: 'drawer-title'}, 'Review provenance')),
            button('Close', () => drawer.close(), 'ghost small', 'close', {'aria-label': 'Close finding details'})));
        const details = E('div', {class: 'drawer-body'}, badge(human(row.assessment), row.assessment === 'possible' ? 'warning' : 'neutral'),
            E('h3', {class: 'finding-value'}, row.indicator_value), E('p', {class: 'muted'}, `${human(row.indicator_type)} · ${moduleInfo(row.source_tool)[0]}`),
            E('dl', {class: 'metadata-list'}, keyValue('Collected', formatDate(row.collected_at)), keyValue('Imported', formatDate(row.imported_at)),
                keyValue('Scope', human(row.scope_status)), keyValue('Confidence', row.confidence === null || row.confidence === undefined ? 'Not assigned' : `${Math.round(row.confidence * 100)}%`),
                keyValue('Source record', row.source_record_id, true), keyValue('Finding ID', row.finding_id, true),
                keyValue('Source SHA-256', row.raw_source_hash || row.evidence_reference, true)));
        if (row.relationship) details.append(E('h3', {}, 'Observed relationship'), E('dl', {class: 'metadata-list'},
            keyValue('From', row.relationship.source, true), keyValue('Relationship', human(row.relationship.type)), keyValue('To', row.relationship.target, true)));
        if (row.details && Object.keys(row.details).length) details.append(E('details', {class: 'help-panel'}, E('summary', {}, 'Additional normalized details'), E('pre', {class: 'code-block'}, JSON.stringify(row.details, null, 2))));
        details.append(notice('The source hash links this finding to the retained import. It establishes consistency with that source, not who created it or whether its interpretation is correct.'));
        drawer.append(details, E('div', {class: 'modal-footer'}, button('Copy finding ID', () => copyText(row.finding_id), 'secondary', 'copy'), button('Done', () => drawer.close(), 'primary')));
        drawer.showModal();
    }

    function renderTelemetry(page) {
        const telemetry = ui.data.telemetry || {};
        const health = telemetry.health || {};
        page.append(pageHeader('Telemetry', 'A readable view of saved observations from your honeypot environment.', button('Refresh', () => refresh(true), 'secondary', 'refresh')));
        page.append(notice('This view reads saved observations. Refreshing the dashboard does not probe services or start a new collection.'));
        const sources = Array.isArray(telemetry.sources) ? telemetry.sources : [];
        const rows = sources.length ? E('div', {class: 'list'}, sources.map(source => {
            const unavailable = source.status === 'unavailable' || source.present === null;
            const observed = source.present === true;
            return E('div', {class: 'list-row'}, E('span', {class: 'module-icon'}, icon('pulse')),
                E('div', {class: 'row-main'}, E('strong', {}, human(source.name)),
                    E('span', {class: 'muted'}, observed ? ageLabel(source.last_write_age) : unavailable ? 'Saved data could not be read safely' : 'No saved data available')),
                badge(observed ? 'Observed' : unavailable ? 'Unavailable' : 'Not collected', observed ? 'success' : unavailable ? 'warning' : 'neutral'));
        })) :
            empty('No telemetry connected yet', 'Saved observations will appear here when this dashboard reads your runtime data.', button('How telemetry connects', () => openHelp('telemetry'), 'secondary', 'help'), 'pulse');
        const healthSummary = E('dl', {class: 'metadata-list'}, keyValue('Observation', telemetry.status === 'available' ? 'Saved data available' : human(telemetry.status || 'not_collected')),
            keyValue('Recorded', formatDate(health.timestamp)), keyValue('Saved severity', human(health.severity || 'unknown')));
        page.append(E('div', {class: 'section-grid'}, card('Telemetry sources', 'Presence and recency from saved local data.', rows),
            card('Latest saved health', 'An observation, rather than a live health guarantee.', healthSummary,
                badge(telemetry.status === 'unavailable' ? 'Unavailable' : health.timestamp ? (health.stale ? 'Saved · stale' : 'Saved observation') : 'Not collected', telemetry.status === 'unavailable' ? 'warning' : 'neutral'))));
        const services = serviceRows(health);
        if (services.length) page.append(card('Service observations', 'State recorded by the last health collection.', servicesTable(services)));
    }

    function ageLabel(seconds) {
        if (typeof seconds !== 'number') return 'Recency not recorded';
        if (seconds < 60) return 'Written less than a minute ago';
        if (seconds < 3600) return `Last written ${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `Last written ${Math.floor(seconds / 3600)} hours ago`;
        return `Last written ${Math.floor(seconds / 86400)} days ago`;
    }

    function serviceRows(health) {
        const raw = health.services || health.containers || {};
        if (Array.isArray(raw)) return raw;
        return Object.entries(raw).map(([name, data]) => ({name, ...(data && typeof data === 'object' ? data : {})}));
    }

    function servicesTable(rows) {
        return E('div', {class: 'table-wrap'}, E('table', {class: 'data-table'}, E('thead', {}, E('tr', {}, ['Service', 'Saved state', 'Saved health'].map(label => E('th', {scope: 'col'}, label)))),
            E('tbody', {}, rows.map(row => E('tr', {}, E('td', {}, human(row.name)), E('td', {}, badge(human(row.state || 'unknown'), row.state === 'running' ? 'success' : 'neutral')), E('td', {}, human(row.health || 'unknown')))))));
    }

    function renderHoneypot(page) {
        const posture = ui.data.posture || {};
        page.append(pageHeader('Your free honeypot core', 'Observe interactions, reconcile signals and preserve evidence in the wider HoneyTrace workspace.', button('View telemetry', () => navigate('telemetry'), 'secondary', 'pulse')));
        page.append(E('section', {class: 'core-card honeypot-hero'}, E('div', {class: 'core-card-copy'}, badge('FREE CORE', 'accent'), E('h2', {}, 'The foundation of your security picture.'),
            E('p', {}, 'HoneyTrace brings decoy-service observations and network telemetry into a traceable evidence workflow. Add offline analysis and optional tools when you need them.'),
            E('div', {class: 'actions'}, button('Review saved observations', () => navigate('telemetry'), 'secondary', 'arrow'), button('Explore integrations', () => navigate('integrations'), 'ghost', 'plug'))),
            E('div', {class: 'core-art', 'aria-hidden': 'true'}, E('span', {}, 'HT'), E('span', {class: 'core-art-slash'}, '//'), icon('shield'))));
        page.append(E('div', {class: 'stats-grid'},
            postureCard('Honeypot observations', posture.honeypot === 'observed' ? 'Observed' : 'Not checked', 'Saved service observations appear in Telemetry.', 'shield'),
            postureCard('Containment posture', posture.guard === 'not_checked' || !posture.guard ? 'Not checked' : human(posture.guard), 'Only a runtime check can establish the current guard state.', 'lock'),
            postureCard('Runtime qualification', posture.beta === 'not_qualified' || !posture.beta ? 'Not qualified' : human(posture.beta), 'This dashboard does not change deployment qualification.', 'info')));
        page.append(card('One evidence workflow', 'From an observed interaction to an understandable record.', E('div', {class: 'flow-steps'},
            workflowStep('01', 'Observe', 'Decoy services and sensors record interactions.', 'pulse'),
            workflowStep('02', 'Reconcile', 'Review related observations and their limitations.', 'search'),
            workflowStep('03', 'Preserve', 'Keep originals and follow hash-linked provenance.', 'folder'))));
        page.append(notice(posture.note || 'Saved observations do not establish current runtime qualification. Service startup and containment remain in the existing operator workflow.'));
    }

    function postureCard(label, value, message, glyph) {
        return E('section', {class: 'stat-card'}, E('div', {class: 'stat-label'}, E('span', {}, label), icon(glyph)), E('h3', {class: 'posture-value'}, value), E('p', {class: 'muted'}, message));
    }
    function workflowStep(number, title, text, glyph) {
        return E('div', {class: 'flow-step'}, E('span', {class: 'eyebrow'}, number), icon(glyph), E('h3', {}, title), E('p', {class: 'muted'}, text));
    }

    function renderIntegrations(page) {
        page.append(pageHeader('Your tools, connected.', 'Bring existing reports into one evidence workflow. Enable only what you need.', button('Manage modules', () => navigate('settings'), 'secondary', 'settings')));
        if (!ui.data.policy?.enabled) page.append(notice('Offline integrations are currently off. Choose your modules in Settings to start importing.', 'info', button('Choose modules', () => navigate('settings'), 'ghost small', 'arrow')));
        const grid = E('div', {class: 'module-grid'});
        for (const spec of ui.data.integrations || []) {
            const [title, category, copy, glyph] = moduleInfo(spec.identifier);
            const active = enabled(spec.identifier);
            grid.append(E('section', {class: 'module-card'}, E('div', {class: 'module-card-top'}, E('span', {class: 'module-icon'}, icon(glyph)), badge(active ? 'Enabled' : 'Optional', active ? 'success' : 'neutral')),
                E('p', {class: 'eyebrow'}, category), E('h2', {}, title), E('p', {class: 'muted'}, copy),
                E('div', {class: 'format-pills'}, (spec.input_formats || []).map(value => E('span', {class: 'pill'}, value === 'binary' ? 'Local file' : value.toUpperCase()))),
                button(active ? moduleActionLabel(spec.identifier) : 'Enable module', () => active ? openModule(spec.identifier) : navigate('settings'), active ? 'secondary' : 'ghost', active ? 'arrow' : 'plug')));
        }
        page.append(grid, E('div', {class: 'section-heading'}, E('div', {}, E('p', {class: 'eyebrow'}, 'ON THE ROADMAP'), E('h2', {}, 'Hardware capture, when you are ready.'))));
        const hardware = ui.data.hardware?.length ? ui.data.hardware : [
            {id: 'ble', name: 'Bluetooth Low Energy', description: 'Future scanner adapters for nearby BLE observations.'},
            {id: 'wifi', name: 'Wi-Fi', description: 'Future capture adapters for supported Wi-Fi hardware.'},
            {id: 'rf', name: 'RF', description: 'Future radio-frequency hardware integrations.'}];
        page.append(E('div', {class: 'hardware-grid'}, hardware.map(item => E('section', {class: 'planned-card'}, icon('radio'), badge('Planned'), E('h3', {}, item.name), E('p', {class: 'muted'}, item.description)))),
            E('p', {class: 'footer-note'}, 'Hardware capture is a later milestone. Supported offline radio exports can already be analyzed through Sentinel.'));
    }

    function moduleActionLabel(id) {
        return ({sentinel: 'Import completed case', imazing: 'Import backup metadata', 'mock-ti': 'Try mock enrichment', forensics: 'Prepare local handoff'})[id] || 'Import report';
    }
    function openModule(id) {
        if (id === 'mock-ti') return openEnrichment();
        if (id === 'forensics') return openForensics();
        return openImport(id);
    }

    function renderSettings(page) {
        const current = ui.data.policy || {};
        page.append(pageHeader('Workspace settings', 'Choose optional modules and the scope of your offline review. Changes apply only when you save.'));
        const form = E('form', {class: 'panel-stack'});
        const master = E('input', {type: 'checkbox', role: 'switch', checked: !!current.enabled, id: 'enable-integrations'});
        const moduleInputs = new Map();
        form.append(card('Start with the tools you need', 'The free honeypot core is separate from these optional offline modules.',
            E('div', {}, E('label', {class: 'toggle-row', htmlFor: 'enable-integrations'},
                E('span', {}, E('strong', {}, 'Enable offline imports'), E('span', {class: 'field-help'}, 'Allow selected modules to import reports. Disabling keeps your evidence; re-enable modules to see their results.')), master),
            E('div', {class: 'module-options'}, (ui.data.integrations || []).map(spec => {
                const input = E('input', {type: 'checkbox', checked: (current.plugins || []).includes(spec.identifier), value: spec.identifier});
                moduleInputs.set(spec.identifier, input);
                return E('label', {class: 'module-option'}, input, E('span', {}, E('strong', {}, moduleInfo(spec.identifier)[0]), E('span', {class: 'field-help'}, moduleInfo(spec.identifier)[1])));
            })))));
        const scope = E('textarea', {rows: 4, placeholder: 'example.org\n192.0.2.0/24', value: (current.scope || []).join('\n'), id: 'asset-scope', spellcheck: false});
        const assessment = E('input', {type: 'checkbox', checked: !!current.assessment_approved, id: 'assessment-approved'});
        const awareness = E('input', {type: 'checkbox', checked: !!current.awareness_approved, id: 'awareness-approved'});
        const privacy = E('input', {type: 'text', value: current.privacy_policy || '', placeholder: 'For example: training-policy-2026', id: 'privacy-policy', maxlength: 256});
        form.append(E('div', {class: 'settings-grid'},
            card('Assessment scope', 'Used when importing Nmap, Nuclei and CloudFox reports.', E('div', {}, field('Assets you are authorized to assess', scope, 'Enter one domain, IP address, network range or exact cloud resource per line.'),
                E('label', {class: 'checkbox-row'}, assessment, E('span', {}, 'I am authorized to review assessment reports for these assets.')))),
            card('Awareness report privacy', 'Only aggregate campaign metrics are accepted.', E('div', {},
                E('label', {class: 'checkbox-row'}, awareness, E('span', {}, 'Aggregate training reports are approved for this workspace.')),
                field('Training privacy policy', privacy, 'Record the policy or approval reference used for these reports.')))));
        const advanced = E('details', {class: 'card help-panel'}, E('summary', {}, 'Import limits & data handling'),
            E('div', {class: 'card-body'}, E('p', {class: 'muted'}, `Reports are limited to ${Math.round((current.max_bytes || MAX_FILE) / 1024 / 1024)} MiB and ${count(current.max_records || 10000)} records per import. Parser workers use a bounded timeout. These settings do not start scanners or send data to providers.`),
                E('p', {class: 'muted'}, `Retention eligibility: ${current.retention_days || 30} days. Evidence is not deleted automatically. Original files remain in the private local store; exports contain normalized findings.`)));
        form.append(advanced, E('div', {class: 'form-actions'}, E('p', {class: 'field-help'}, 'No changes are applied until you save.'), E('button', {type: 'submit', class: 'button primary'}, icon('check'), 'Save settings')));
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const chosen = [...moduleInputs].filter(([, input]) => input.checked).map(([id]) => id);
            if (master.checked && !chosen.length) { toast('Choose at least one module, or leave offline imports switched off.', 'error'); return; }
            if (awareness.checked && chosen.includes('awareness') && !privacy.value.trim()) { privacy.focus(); toast('Add a privacy policy reference for awareness reports.', 'error'); return; }
            const payload = {...current, enabled: master.checked, plugins: chosen,
                scope: [...new Set(scope.value.split(/[\n,]/).map(value => value.trim()).filter(Boolean))],
                assessment_approved: assessment.checked, awareness_approved: awareness.checked,
                privacy_policy: privacy.value.trim()};
            setBusy(form, true);
            try { await api('/api/policy', payload); await refresh(); toast(payload.enabled ? 'Workspace settings saved. Your selected modules are ready.' : 'Settings saved. Evidence is preserved while modules are disabled.'); }
            catch (error) { toast(error.message, 'error'); }
            finally { setBusy(form, false); }
        });
        page.append(form);
    }

    function field(label, input, help = '') {
        const id = input.id || `field-${Math.random().toString(36).slice(2)}`;
        input.id = id;
        const helper = help ? E('p', {id: `${id}-help`, class: 'field-help'}, help) : null;
        if (helper) input.setAttribute('aria-describedby', helper.id);
        return E('div', {class: 'field'}, E('label', {class: 'field-label', htmlFor: id}, label), input, helper);
    }

    function setBusy(form, busy) {
        form.setAttribute('aria-busy', String(busy));
        $$('button, input, select, textarea', form).forEach(element => {
            if (busy) { element.dataset.wasDisabled = String(element.disabled); element.disabled = true; }
            else { element.disabled = element.dataset.wasDisabled === 'true'; delete element.dataset.wasDisabled; }
        });
    }

    function modal(title, subtitle) {
        closeNavigation();
        const dialog = $('#modal');
        if (dialog.open) dialog.close();
        const body = E('div', {class: 'modal-body'});
        dialog.replaceChildren(E('div', {class: 'modal-header'}, E('div', {}, E('p', {class: 'eyebrow'}, 'LOCAL WORKSPACE'), E('h2', {id: 'modal-title'}, title), E('p', {class: 'muted'}, subtitle)),
            button('Close', () => dialog.close(), 'ghost small', 'close', {'aria-label': 'Close dialog'})), body);
        dialog.showModal();
        return {dialog, body};
    }

    function chooseModuleNotice(id) {
        if (enabled(id)) return null;
        return notice(`${moduleInfo(id)[0]} is not enabled yet. Choose it in Settings before importing.`, 'info',
            button('Open settings', () => {$('#modal').close(); navigate('settings');}, 'ghost small', 'arrow'));
    }

    function openImport(preset = '') {
        if (preset === 'sentinel') return openSentinel();
        if (preset === 'imazing') return openBackup();
        const {dialog, body} = modal('Import evidence', 'Bring an existing offline report into your private workspace.');
        const specs = (ui.data.integrations || []).filter(spec => genericModules.has(spec.identifier));
        if (!specs.length) {body.append(empty('No report modules available', 'Check your workspace configuration.')); return;}
        const selected = specs.find(spec => spec.identifier === preset) || specs.find(spec => enabled(spec.identifier)) || specs[0];
        const plugin = E('select', {id: 'import-plugin', value: selected.identifier}, specs.map(spec => E('option', {value: spec.identifier}, `${moduleInfo(spec.identifier)[0]}${enabled(spec.identifier) ? '' : ' · not enabled'}`)));
        const format = E('select', {id: 'import-format'});
        const file = E('input', {type: 'file', id: 'import-file', required: true});
        const filename = E('p', {class: 'file-name'}, 'No file selected');
        const status = E('div');
        const importButton = E('button', {type: 'submit', class: 'button primary'}, icon('upload'), 'Import report');
        const uploadArea = E('label', {class: 'dropzone', htmlFor: 'import-file'}, icon('upload'), E('strong', {}, 'Choose a report file'), E('span', {class: 'muted'}, 'or drag and drop it here'), filename, file);
        const form = E('form', {class: 'panel-stack'}, E('div', {class: 'form-grid'}, field('Source tool', plugin), field('Report format', format)), status, uploadArea,
            E('p', {class: 'field-help'}, 'Your original source is preserved by hash. Only normalized findings appear in exports.'),
            E('details', {class: 'help-panel'}, E('summary', {}, 'New here? Try a sample or another evidence type.'),
                E('div', {class: 'panel-stack'}, E('p', {class: 'muted'}, 'The sample contains two synthetic SpiderFoot observations. Enable SpiderFoot, choose CSV, then import the downloaded file.'),
                    button('Download sample CSV', downloadSample, 'secondary small', 'download'),
                    E('div', {class: 'actions'}, button('Sentinel case', openSentinel, 'ghost small', 'folder'), button('Backup metadata', openBackup, 'ghost small', 'file')))),
            E('div', {class: 'modal-footer'}, button('Cancel', () => dialog.close(), 'secondary'), importButton));
        function update() {
            const spec = specs.find(value => value.identifier === plugin.value);
            format.replaceChildren(...(spec.input_formats || []).map(value => E('option', {value}, value.toUpperCase())));
            file.accept = (spec.input_formats || []).map(value => `.${value}`).join(',');
            status.replaceChildren();
            const unavailable = chooseModuleNotice(plugin.value);
            if (unavailable) status.append(unavailable);
            if (['nmap', 'nuclei', 'cloudfox', 'bloodhound'].includes(plugin.value)) status.append(notice('These reports require assessment approval and the appropriate asset scope in Settings.'));
            if (plugin.value === 'awareness') status.append(notice('Only approved aggregate training metrics are accepted; employee-level records are excluded.'));
            importButton.disabled = !enabled(plugin.value);
        }
        plugin.addEventListener('change', update);
        file.addEventListener('change', () => {filename.textContent = file.files[0] ? `${file.files[0].name} · ${fileSize(file.files[0].size)}` : 'No file selected';});
        setupDropzone(uploadArea, file);
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (!file.files[0]) {toast('Choose a report to import.', 'error'); return;}
            setBusy(form, true);
            try {
                const encoded = await encodeFile(file.files[0], ui.data.policy?.max_bytes || MAX_FILE);
                const result = await api('/api/import', {plugin: plugin.value, format: format.value, data: encoded});
                dialog.close();
                ui.filters = {query: '', plugin: '', assessment: ''};
                await refresh();
                navigate('evidence');
                toast(importMessage(result.manifest));
            } catch (error) {toast(error.message, 'error');}
            finally {setBusy(form, false);}
        });
        body.append(form);
        update();
    }

    function importMessage(manifest) {
        return manifest?.deduplicated ? 'This source was already imported. Its original record has been preserved.' : `Imported ${count(manifest?.records)} normalized records. Ready for review.`;
    }
    function fileSize(size) {return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;}
    async function encodeFile(file, maximum = MAX_FILE) {
        if (!file || file.size > maximum) throw new Error(`Choose a file smaller than ${fileSize(maximum)} for this import.`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        let text = '';
        for (let offset = 0; offset < bytes.length; offset += 32768) text += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
        return btoa(text);
    }
    function setupDropzone(zone, input) {
        zone.addEventListener('dragover', event => {event.preventDefault(); zone.classList.add('drag-over');});
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', event => {
            event.preventDefault(); zone.classList.remove('drag-over');
            if (event.dataTransfer.files.length !== 1) {toast('Choose one report at a time.', 'error'); return;}
            input.files = event.dataTransfer.files;
            input.dispatchEvent(new Event('change'));
        });
    }

    function openSentinel() {
        const {dialog, body} = modal('Import a Sentinel case', 'Connect a completed local case while keeping its namespace and provenance.');
        const folder = E('input', {type: 'text', placeholder: '/absolute/path/to/completed-case', required: true, spellcheck: false, id: 'sentinel-folder'});
        const form = E('form', {class: 'panel-stack'}, chooseModuleNotice('sentinel'),
            field('Local case folder', folder, 'Use a folder on the machine running this dashboard, containing the completed case and its SHA256SUMS file.'),
            notice('The importer verifies the complete case before retaining its minimized exchange. Initial support is for small cases: exchange up to 8 MiB, 10,000 records and a 64 MiB complete-case verification budget.'),
            E('details', {class: 'help-panel'}, E('summary', {}, 'About PCAP and Packet Squirrel analysis'), E('p', {class: 'muted'}, 'Analyze original captures in the standalone Sentinel offline analyzer first, then import its completed case here. Packet Squirrel uses Sentinel’s PCAP workflow. Larger case jobs are planned for a later milestone.')),
            E('div', {class: 'modal-footer'}, button('Cancel', () => dialog.close(), 'secondary'), E('button', {type: 'submit', class: 'button primary', disabled: !enabled('sentinel')}, icon('folder'), 'Verify & import case')));
        form.addEventListener('submit', async event => {
            event.preventDefault(); setBusy(form, true);
            try {const result = await api('/api/sentinel', {bundle_path: folder.value.trim()}); dialog.close(); await refresh(); navigate('evidence'); toast(importMessage(result.manifest));}
            catch (error) {toast(error.message, 'error');}
            finally {setBusy(form, false);}
        });
        body.append(form);
    }

    function openBackup() {
        const {dialog, body} = modal('Import backup metadata', 'Review the metadata inventory of a finished, unencrypted Apple or iMazing backup.');
        const fields = new Map();
        const fileFields = ['Manifest.plist', 'Status.plist', 'Manifest.db'].map(name => {
            const input = E('input', {type: 'file', required: true, accept: name.endsWith('.db') ? '.db' : '.plist'});
            fields.set(name, input);
            return field(name, input, name === 'Manifest.db' ? 'Up to 8 MiB; initial imports support a bounded metadata inventory.' : 'Up to 1 MiB.');
        });
        const form = E('form', {class: 'panel-stack'}, chooseModuleNotice('imazing'),
            notice('Select only these three metadata files from the same completed backup. No device file contents are uploaded or recovered, and encrypted backups are not decrypted.'),
            fileFields, E('div', {class: 'modal-footer'}, button('Cancel', () => dialog.close(), 'secondary'), E('button', {type: 'submit', class: 'button primary', disabled: !enabled('imazing')}, icon('upload'), 'Import metadata')));
        form.addEventListener('submit', async event => {
            event.preventDefault(); setBusy(form, true);
            try {
                const files = {};
                for (const [name, input] of fields) {
                    if (!input.files[0] || input.files[0].name !== name) throw new Error(`Choose the file named ${name} from this backup.`);
                    files[name] = await encodeFile(input.files[0], name === 'Manifest.db' ? MAX_FILE : 1024 * 1024);
                }
                await api('/api/imazing', {files}); dialog.close(); await refresh(); navigate('evidence'); toast('Backup metadata imported. Original metadata files are preserved privately.');
            } catch (error) {toast(error.message, 'error');}
            finally {setBusy(form, false);}
        });
        body.append(form);
    }

    function openEnrichment() {
        const {dialog, body} = modal('Explore threat intelligence', 'Use a local mock response to learn the enrichment workflow. No provider is contacted.');
        const providers = [['otx', 'AlienVault OTX'], ['abuseipdb', 'AbuseIPDB'], ['greynoise', 'GreyNoise'], ['virustotal', 'VirusTotal'], ['threatfox', 'ThreatFox'], ['certificate-transparency', 'Certificate transparency']];
        const provider = E('select', {}, providers.map(([id, label]) => E('option', {value: id}, label)));
        const type = E('select', {}, [['ip', 'IP address'], ['domain', 'Domain'], ['url', 'URL'], ['file', 'File SHA-256']].map(([id, label]) => E('option', {value: id}, label)));
        const value = E('input', {type: 'text', required: true, placeholder: 'Public indicator to review', spellcheck: false});
        const response = E('textarea', {rows: 6, value: '{\n  "pulse_info": {"count": 2}\n}', spellcheck: false, required: true});
        const output = E('div', {role: 'status'});
        const form = E('form', {class: 'panel-stack'}, chooseModuleNotice('mock-ti'),
            E('div', {class: 'form-grid'}, field('Mock provider', provider), field('Indicator type', type)), field('Indicator', value),
            field('Local mock response JSON', response, 'Use a sanitized fixture response. Private/internal indicators and secret-bearing URL queries are refused.'), output,
            E('div', {class: 'modal-footer'}, button('Close', () => dialog.close(), 'secondary'), E('button', {type: 'submit', class: 'button primary', disabled: !enabled('mock-ti')}, icon('spark'), 'Run mock enrichment')));
        form.addEventListener('submit', async event => {
            event.preventDefault();
            let parsed;
            try {parsed = JSON.parse(response.value);} catch (_) {toast('Enter valid JSON for the local mock response.', 'error'); return;}
            setBusy(form, true);
            try {
                const result = await api('/api/enrich', {provider: provider.value, type: type.value, value: value.value.trim(), response: parsed});
                output.replaceChildren(notice(`Mock result: ${human(result.status)}. This is contextual information for review, not proof.`, result.status === 'ok' ? 'success' : 'info'),
                    E('pre', {class: 'code-block'}, JSON.stringify(result, null, 2)));
            } catch (error) {toast(error.message, 'error');}
            finally {setBusy(form, false);}
        });
        body.append(form);
    }

    function openForensics() {
        const {dialog, body} = modal('Prepare a local forensic handoff', 'Preserve a hash-linked copy for analysis in your own offline tools.');
        const input = E('input', {type: 'file', required: true});
        const form = E('form', {class: 'panel-stack'}, chooseModuleNotice('forensics'),
            field('Source file', input, 'Initial handoffs are limited to 8 MiB. The source is retained privately by its hash.'),
            notice('This prepares a copy and provenance record. It does not execute a processor, upload evidence externally or change the original file.'),
            E('div', {class: 'modal-footer'}, button('Cancel', () => dialog.close(), 'secondary'), E('button', {type: 'submit', class: 'button primary', disabled: !enabled('forensics')}, icon('file'), 'Preserve handoff')));
        form.addEventListener('submit', async event => {
            event.preventDefault(); setBusy(form, true);
            try {if (!input.files[0]) throw new Error('Choose a source file.'); await api('/api/forensics', {data: await encodeFile(input.files[0])}); dialog.close(); await refresh(); toast('Local handoff preserved with its source hash.');}
            catch (error) {toast(error.message, 'error');}
            finally {setBusy(form, false);}
        });
        body.append(form);
    }

    function openHelp(section = '') {
        const {dialog, body} = modal('A clear path through your evidence', 'Observe → Reconcile → Preserve');
        body.append(E('div', {class: 'flow-steps'}, workflowStep('01', 'Choose tools', 'Enable offline imports and select the modules you need in Settings.', 'plug'),
            workflowStep('02', 'Import & review', 'Choose a report, import it, then review observations and their source references.', 'search'),
            workflowStep('03', 'Preserve & export', 'Originals stay in the private store. Export normalized findings for your next step.', 'folder')),
            E('div', {class: 'actions'}, button('Open settings', () => {dialog.close(); navigate('settings');}, 'primary', 'settings'), button('Download sample CSV', downloadSample, 'secondary', 'download')),
            E('p', {class: 'field-help'}, 'The sample contains clearly labeled synthetic observations for SpiderFoot CSV import. It is not live telemetry.'),
            helpDetail('What does “local / offline” mean?', 'This dashboard and the available report workflows run on the local machine. Imports do not launch scans or contact threat-intelligence providers. Provider enrichment is currently mock-only.'),
            helpDetail('How do saved telemetry and honeypot status connect?', 'Launch the dashboard with access to your existing runtime root to read saved health observations and source recency. A dashboard refresh reads that saved information; it does not inspect containers, collect traffic or establish the current containment state.', section === 'telemetry'),
            helpDetail('Which reports can I import?', 'SpiderFoot CSV/GEXF, supported Recon-ng JSON, BBOT JSONL, Nmap XML, Nuclei JSONL and documented cloud/identity/awareness summaries. Sentinel uses a verified completed case folder; backup metadata uses three specific files. Initial report imports are bounded to 8 MiB and 10,000 records.'),
            helpDetail('What should I conclude from a finding?', 'A finding is an observation or a review lead. Review its source, time, context and limitations. Similar indicators do not establish shared ownership, a person’s identity or proof of compromise.'),
            helpDetail('What happens to my original files?', 'Accepted imports are retained privately by SHA-256 alongside hash-linked normalized findings. Reimporting the same source does not duplicate its history. A hash supports consistency with the retained source; it does not authenticate acquisition.'),
            E('div', {class: 'modal-footer'}, button('Got it', () => dialog.close(), 'primary', 'check')));
    }

    function helpDetail(title, text, open = false) {return E('details', {class: 'help-panel', open}, E('summary', {}, title), E('p', {class: 'muted'}, text));}

    function download(filename, data, mime = 'application/json') {
        const url = URL.createObjectURL(new Blob([data], {type: mime}));
        const anchor = E('a', {href: url, download: filename});
        document.body.append(anchor); anchor.click(); anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function downloadSample() {
        download('honeytrace-sample-spiderfoot.csv', 'id,type,data,source,updated\nsynthetic-domain-1,INTERNET_NAME,sample.example.org,,2026-11-01T00:00:00Z\nsynthetic-url-1,URL,https://sample.example.org/help,sample.example.org,2026-11-01T00:00:00Z\n', 'text/csv;charset=utf-8');
        toast('Synthetic sample downloaded. Import it using SpiderFoot → CSV.');
    }
    async function exportFindings() {
        try {const result = await api('/api/export'); download('honeytrace-findings.json', JSON.stringify(result, null, 2)); toast('Normalized findings exported. Original source bytes stay private.');}
        catch (error) {toast(error.message, 'error');}
    }
    async function copyText(value) {
        try {await navigator.clipboard.writeText(String(value)); toast('Copied to clipboard.');}
        catch (_) {toast('Clipboard access is unavailable. Select and copy the displayed value.', 'error');}
    }
    function closeNavigation(restoreFocus = false) {
        const wasOpen = $('#sidebar').classList.contains('is-open');
        $('#sidebar').classList.remove('is-open');
        $('#mobile-nav-backdrop').hidden = true;
        $('#mobile-menu').setAttribute('aria-expanded', 'false');
        if (restoreFocus && wasOpen) $('#mobile-menu').focus();
    }

    $$('.nav-button[data-page]').forEach(item => item.addEventListener('click', () => navigate(item.dataset.page)));
    $('[data-nav="overview"]').addEventListener('click', event => {event.preventDefault(); navigate('overview');});
    $('#auth-form').addEventListener('submit', event => {event.preventDefault(); connect($('#access-token').value);});
    $('#refresh-button').addEventListener('click', () => refresh(true));
    $('#help-button').addEventListener('click', () => openHelp());
    $('#sidebar-guide').addEventListener('click', () => openHelp());
    $('#mobile-menu').addEventListener('click', () => {
        const open = !$('#sidebar').classList.contains('is-open');
        $('#sidebar').classList.toggle('is-open', open);
        $('#mobile-nav-backdrop').hidden = !open;
        $('#mobile-menu').setAttribute('aria-expanded', String(open));
        if (open) $('#sidebar .nav-button.active').focus();
    });
    $('#mobile-nav-backdrop').addEventListener('click', () => closeNavigation(true));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeNavigation(true);
        if (event.key !== 'Tab' || !$('#sidebar').classList.contains('is-open') || $('dialog[open]')) return;
        const focusable = $$('a, button:not(:disabled)', $('#sidebar'));
        const target = event.shiftKey && document.activeElement === focusable[0] ? focusable.at(-1)
            : !event.shiftKey && document.activeElement === focusable.at(-1) ? focusable[0] : null;
        if (target) {event.preventDefault(); target.focus();}
    });
    window.matchMedia('(min-width: 761px)').addEventListener('change', event => {if (event.matches) closeNavigation();});
    for (const dialog of $$('dialog')) dialog.addEventListener('click', event => {if (event.target === dialog) dialog.close();});

    const params = new URLSearchParams(window.location.hash.slice(1));
    const initialToken = params.get('token');
    if (initialToken) {
        history.replaceState(null, '', `${location.pathname}${location.search}`);
        connect(initialToken);
    }
})();
