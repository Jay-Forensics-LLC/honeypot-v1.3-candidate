'use strict';

(() => {
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const titles = {overview: 'Overview', evidence: 'Evidence & analysis', cases: 'Forensic cases', security: 'Security review', telemetry: 'Telemetry', equipment: 'My equipment', honeypot: 'Honeypot', integrations: 'Integrations', diagnostics: 'Diagnostics', settings: 'Settings'};
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
    const caseView = {selected: '', filters: null, request: 0, poll: null};
    const equipmentView = {query: '', category: '', status: '', equipment_class: ''};
    const securityView = {importIds: [], query: '', asset_id: null, status: 'all', offset: 0, limit: 50};
    const triageStatuses = {unreviewed: 'Unreviewed', in_review: 'In review', resolved: 'Resolved', accepted_risk: 'Accepted risk', false_positive: 'False positive'};
    const equipmentTracking = {
        manual: ['Manual reports', 'Record the status yourself. Each report shows when it was made.'],
        heartbeat: ['Heartbeat reports', 'Status reports act as heartbeats. An old heartbeat becomes unknown.'],
        cowrie: ['Cowrie saved telemetry', 'Use the latest saved Cowrie observation; this does not probe the running service.'],
        opencanary: ['OpenCanary saved telemetry', 'Use the latest saved OpenCanary observation; this does not probe the running service.'],
        suricata: ['Suricata saved telemetry', 'Use the latest saved Suricata observation; this does not probe the running service.'],
        incidentd: ['Incident correlation saved telemetry', 'Use the latest saved incident-correlation observation.'],
        pcap: ['Capture saved telemetry', 'Use the latest saved capture observation; missing or stale observations remain unknown.'],
        sentinel: ['Bundled Sentinel analyzer', 'Ready means the local analyzer is available. It does not establish hardware health.']
    };
    const jobErrors = {companion_unavailable: 'The bundled analyzer is unavailable. Check the source installation or choose a trusted checkout override.',
        invalid_capture: 'Choose a regular PCAP or PCAPNG file on this machine.', job_busy: 'Another analysis is already running.',
        workspace_quota: 'The private analysis workspace is full.', analysis_failed: 'The analyzer could not complete this capture.',
        analysis_timeout: 'Analysis reached its time limit. Try a smaller capture.', analysis_interrupted: 'The dashboard stopped before this analysis finished. Start a new job to try again.', import_failed: 'The output could not be verified and imported. Check the case limits and Sentinel module settings.'};

    function E(tag, props = {}, ...children) {
        const element = document.createElement(tag);
        for (const [key, value] of Object.entries(props)) {
            if (value === undefined || value === null || key === 'value') continue;
            if (key === 'class') element.className = value;
            else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2).toLowerCase(), value);
            else if (key in element && !key.startsWith('aria-') && key !== 'role' && key !== 'list') element[key] = value;
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
        clearTimeout(caseView.poll);
        caseView.request++;
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
        document.title = `${titles[page]} · HoneyTrace Forensic Dashboard`;
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
        clearTimeout(caseView.poll);
        caseView.request++;
        const page = E('div', {class: `page page-${ui.page}`});
        const renderer = {overview: renderOverview, evidence: renderEvidence, cases: renderCases, security: renderSecurity, telemetry: renderTelemetry, equipment: renderEquipment, honeypot: renderHoneypot, integrations: renderIntegrations, diagnostics: renderDiagnostics, settings: renderSettings}[ui.page];
        renderer(page);
        for (const error of (ui.data.errors || []).slice(0, 3).reverse()) {
            const action = error.module === 'policy' && ui.page !== 'settings' ? button('Open settings', () => navigate('settings'), 'ghost small', 'settings') : null;
            page.insertBefore(notice(error.message || 'Some workspace data is unavailable. Try refreshing.', 'warning', action), page.children[1] || null);
        }
        $('#main').replaceChildren(page);
    }

    function renderOverview(page) {
        const data = ui.data;
        page.append(pageHeader('HoneyTrace Forensic Dashboard', 'Your security suite: connect observations, understand findings and preserve what matters.',
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
            E('div', {class: 'list'}, miniCapability('Forensic cases', 'Capture analysis, timelines and coverage', 'folder', () => navigate('cases')),
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
            button('Forensic cases', () => navigate('cases'), 'secondary', 'clock'),
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
        const forensic = row.source_tool === 'sentinel';
        const metrics = row.details?.metrics || {};
        const provenance = row.details?.provenance || {};
        drawer.replaceChildren(E('div', {class: 'drawer-header'}, E('div', {}, E('p', {class: 'eyebrow'}, 'OBSERVATION DETAILS'), E('h2', {id: 'drawer-title'}, 'Review provenance')),
            button('Close', () => drawer.close(), 'ghost small', 'close', {'aria-label': 'Close finding details'})));
        const details = E('div', {class: 'drawer-body'}, badge(human(row.assessment), row.assessment === 'possible' ? 'warning' : 'neutral'),
            E('h3', {class: 'finding-value'}, forensic ? human(metrics.rule || metrics.kind || metrics.entity) : row.indicator_value), E('p', {class: 'muted'}, `${forensic ? 'Case-scoped observation' : human(row.indicator_type)} · ${moduleInfo(row.source_tool)[0]}`),
            E('dl', {class: 'metadata-list'}, keyValue('Collected', formatDate(row.collected_at)), keyValue('Imported', formatDate(row.imported_at)),
                keyValue('Scope', human(row.scope_status)), keyValue('Confidence', row.confidence === null || row.confidence === undefined ? 'Not assigned' : `${Math.round(row.confidence * 100)}%`),
                keyValue('Source record', row.source_record_id, true), keyValue('Finding ID', row.finding_id, true),
                keyValue('Source SHA-256', row.raw_source_hash || row.evidence_reference, true)));
        if (forensic) details.append(E('section', {}, E('h3', {}, 'Forensic source reference'), E('dl', {class: 'metadata-list'},
            keyValue('Event time · UTC', exactTime(eventTime(row)), true), keyValue('Time status', human(row.details?.time_status)),
            keyValue('Source / record', `${display(provenance.source_id, '—')} / ${display(provenance.ordinal, '—')}`),
            keyValue('Original source SHA-256', provenance.source_sha256, true),
            keyValue('Byte offset / length', `${display(provenance.byte_offset, '—')} / ${display(provenance.byte_length, '—')}`),
            keyValue('Provenance precision', human(provenance.precision)), keyValue('Record SHA-256', provenance.record_sha256, true))));
        if (row.relationship) details.append(E('h3', {}, 'Observed relationship'), E('dl', {class: 'metadata-list'},
            keyValue('From', row.relationship.source, true), keyValue('Relationship', human(row.relationship.type)), keyValue('To', row.relationship.target, true)));
        if (row.details && Object.keys(row.details).length) details.append(E('details', {class: 'help-panel'}, E('summary', {}, 'Additional normalized details'), E('pre', {class: 'code-block'}, JSON.stringify(row.details, null, 2))));
        details.append(notice('The source hash links this finding to the retained import. It establishes consistency with that source, not who created it or whether its interpretation is correct.'));
        drawer.append(details, E('div', {class: 'modal-footer'}, button('Copy finding ID', () => copyText(row.finding_id), 'secondary', 'copy'), button('Done', () => drawer.close(), 'primary')));
        drawer.showModal();
    }

    function caseFilters() {
        return {query: '', protocol: '', source_id: null, since: '', until: '', include_unresolved: true, offset: 0, limit: 50};
    }

    function caseLabel(id) { return `Case ${String(id).slice(0, 8).toUpperCase()}`; }

    function openCase(id) {
        caseView.selected = id;
        caseView.filters = caseFilters();
        navigate('cases');
    }

    function exactTime(value) {
        if (value === null || value === undefined) return 'Time unresolved';
        try {
            const ns = BigInt(value);
            let seconds = ns / 1000000000n, fraction = ns % 1000000000n;
            if (fraction < 0n) {seconds--; fraction += 1000000000n;}
            return new Date(Number(seconds) * 1000).toISOString().replace('.000Z', `.${String(fraction).padStart(9, '0')}Z`);
        } catch (_) {return 'Time unavailable';}
    }

    function eventTime(row) {
        const metrics = row.details?.metrics || {};
        return Object.hasOwn(metrics, 'adjusted_utc_ns') ? metrics.adjusted_utc_ns : row.details?.source_time?.utc_ns;
    }

    function renderCases(page) {
        const revision = caseView.request;
        page.append(pageHeader('Evidence, with context.', 'Open a case, follow its timeline and see exactly what the analysis covers.',
            button('Import completed case', openSentinel, 'secondary', 'folder'),
            button('Analyze a capture', openCapture, 'primary', 'pulse')));
        if (!enabled('sentinel')) page.append(notice('Enable Sentinel Forensics in Settings to import, analyze and view cases. Preserved cases stay on this machine.', 'info',
            button('Open settings', () => navigate('settings'), 'ghost small', 'settings')));
        const jobs = E('div', {id: 'case-jobs'});
        const list = E('div', {id: 'case-list', class: 'case-list'});
        const detail = E('div', {id: 'case-detail', class: 'case-detail'}, E('div', {class: 'loading-screen'}, E('span', {class: 'spinner'}), E('p', {}, 'Opening cases…')));
        page.append(jobs, E('div', {class: 'case-layout'}, E('aside', {class: 'case-sidebar', 'aria-label': 'Saved forensic cases'},
            E('p', {class: 'eyebrow'}, 'YOUR CASES'), list), detail));
        const current = () => page.isConnected && ui.token && ui.page === 'cases' && revision === caseView.request;
        let previousIds = '';
        async function update(initial = false) {
            try {
                const result = await api('/api/cases');
                if (!current()) return;
                renderJobs(jobs, result.jobs || {available: false, jobs: []}, update);
                const cases = result.cases || [];
                const ids = cases.map(item => item.case_id).join(':');
                if (initial || ids !== previousIds) {
                    if (!cases.some(item => item.case_id === caseView.selected)) {
                        caseView.selected = cases[0]?.case_id || '';
                        caseView.filters = caseFilters();
                    }
                    list.replaceChildren(...cases.map(item => E('button', {type: 'button', class: `case-choice${item.case_id === caseView.selected ? ' selected' : ''}`,
                        'aria-pressed': String(item.case_id === caseView.selected), onClick: () => openCase(item.case_id)},
                        E('span', {class: 'case-choice-top'}, E('strong', {}, caseLabel(item.case_id)), icon('chevron')),
                        E('span', {class: 'row-meta'}, formatDate(item.imported_at, true)),
                        E('span', {class: 'case-choice-counts'}, `${count(item.event_count)} events · ${count(item.finding_count)} leads`))));
                    if (!cases.length) {
                        list.append(E('p', {class: 'field-help'}, enabled('sentinel') ? 'No cases imported yet.' : 'Cases are hidden while this module is disabled.'));
                        detail.replaceChildren(card('Your next investigation starts here', 'A straightforward path from capture to context.',
                            E('div', {class: 'panel-stack'}, E('div', {class: 'flow-steps'},
                                workflowStep('01', 'Bring a capture', 'Use a local PCAP, PCAPNG or Packet Squirrel capture, or import a completed Sentinel case.', 'folder'),
                                workflowStep('02', 'Follow the timeline', 'Search observations and narrow them by source, protocol or time.', 'clock'),
                                workflowStep('03', 'Review coverage', 'See decoded protocols, limitations and source hashes before drawing conclusions.', 'search')),
                            notice('Case identifiers are pseudonyms scoped to each case. Matching labels across different cases do not establish identity.'),
                            E('div', {class: 'actions'}, button('Analyze a capture', openCapture, 'primary', 'pulse'), button('Import completed case', openSentinel, 'secondary', 'folder')))));
                    } else if (initial || !detail.dataset.caseId || detail.dataset.caseId !== caseView.selected) {
                        detail.dataset.caseId = caseView.selected;
                        loadCaseDetail(detail, caseView.selected, current);
                    }
                    previousIds = ids;
                }
                if ((result.jobs?.jobs || []).some(job => job.status === 'running')) {
                    clearTimeout(caseView.poll);
                    caseView.poll = setTimeout(() => {if (current()) update();}, 1200);
                }
            } catch (error) {
                if (!current()) return;
                if (initial) detail.replaceChildren(empty('Cases are unavailable', error.message, button('Try again', () => update(true), 'secondary', 'refresh')));
                else jobs.replaceChildren(notice(error.message, 'warning', button('Try again', () => update(), 'ghost small', 'refresh')));
            }
        }
        update(true);
    }

    function renderJobs(host, state, reload) {
        const jobs = state.jobs || [];
        const signature = JSON.stringify([jobs, state.history_status]);
        if (host.dataset.signature === signature) return;
        host.dataset.signature = signature;
        const focusedJob = host.contains(document.activeElement) ? document.activeElement.closest('[data-job-id]')?.dataset.jobId : null;
        if (!jobs.length && state.history_status !== 'unavailable') {host.replaceChildren(); return;}
        const rows = jobs.slice(0, 5).map(job => {
            const running = job.status === 'running';
            const label = running ? ({starting: 'Preparing capture', ingestion: 'Reading capture', analysis: 'Analyzing observations', verifying: 'Verifying and importing'}[job.stage] || 'Analysis in progress') : human(job.status);
            const action = running ? button('Cancel', async event => {
                const control = event.currentTarget;
                control.disabled = true;
                try {await api('/api/job-cancel', {job_id: job.id}); if (host.isConnected) await reload();}
                catch (error) {toast(error.message, 'error'); if (control.isConnected) control.disabled = false;}
            }, 'ghost small', 'close', {disabled: job.stage === 'verifying', title: job.stage === 'verifying' ? 'Final verification is completing.' : 'Stop this analysis'}) : job.status === 'complete' && job.case_id ? button('Open case', () => openCase(job.case_id), 'secondary small', 'arrow') : null;
            return E('div', {class: 'analysis-job', 'data-job-id': job.id}, running ? E('span', {class: 'spinner', 'aria-hidden': 'true'}) : icon(job.status === 'complete' ? 'check' : 'info'),
                E('div', {class: 'row-main'}, E('strong', {}, label), E('span', {class: 'muted'}, running ? 'Offline analysis · You can keep using this workspace.' :
                    job.status === 'complete' ? 'Case verified and ready to review.' : job.status === 'cancelled' ? 'Analysis stopped. The original capture is unchanged.' : jobErrors[job.error_code] || 'Analysis could not finish. Try another capture or check the bundled analyzer.')),
                badge(running ? 'Running' : human(job.status), job.status === 'complete' ? 'success' : job.status === 'failed' ? 'warning' : 'neutral'), action);
        });
        host.replaceChildren(card('Capture analysis', 'Progress reflects the analyzer’s current stage.', E('div', {class: 'analysis-jobs', role: 'status'},
            state.history_status === 'unavailable' ? notice('Saved analysis history is unavailable. Check the private workspace before starting another job.', 'warning') : null, rows)));
        if (focusedJob) [...host.querySelectorAll('[data-job-id]')].find(row => row.dataset.jobId === focusedJob)?.querySelector('button')?.focus({preventScroll: true});
    }

    async function loadCaseDetail(host, id, current) {
        host.replaceChildren(E('div', {class: 'loading-screen'}, E('span', {class: 'spinner'}), E('p', {}, 'Reading verified case…')));
        try {
            const data = await api('/api/case', {case_id: id, ...(caseView.filters || caseFilters())});
            if (!current() || caseView.selected !== id) return;
            renderCaseDetail(host, data, current);
        } catch (error) {
            if (current() && caseView.selected === id) host.replaceChildren(empty('This case could not be opened', error.message,
                button('Try again', () => loadCaseDetail(host, id, current), 'secondary', 'refresh')));
        }
    }

    function renderCaseDetail(host, data, current) {
        const summary = data.case;
        const header = E('div', {class: 'case-title'}, E('div', {}, E('p', {class: 'eyebrow'}, 'VERIFIED OFFLINE CASE'), E('h2', {}, caseLabel(summary.case_id)),
            E('p', {class: 'muted'}, `Imported ${formatDate(summary.imported_at)} · Parser ${display(summary.parser_version)}`)),
            button('Export case', () => exportCase(summary.case_id), 'secondary small', 'download'));
        const stats = E('div', {class: 'case-metrics'},
            caseMetric('Sources', summary.source_count), caseMetric('Timeline events', summary.event_count), caseMetric('Review leads', summary.finding_count));
        const query = E('input', {id: 'case-search', type: 'search', placeholder: 'Protocol, pseudonym or source hash…', value: caseView.filters?.query || ''});
        const protocol = E('select', {id: 'case-protocol', value: caseView.filters?.protocol || ''}, E('option', {value: ''}, 'All protocols'),
            (data.filters?.protocols || []).map(value => E('option', {value}, human(value))));
        const source = E('select', {id: 'case-source', value: caseView.filters?.source_id ?? ''}, E('option', {value: ''}, 'All sources'),
            (data.filters?.source_ids || []).map(value => E('option', {value}, `Source ${value}`)));
        const since = E('input', {id: 'case-since', type: 'datetime-local', step: '1', value: (caseView.filters?.since || '').replace(/Z$/, '')});
        const until = E('input', {id: 'case-until', type: 'datetime-local', step: '1', value: (caseView.filters?.until || '').replace(/Z$/, '')});
        const unresolved = E('input', {id: 'case-unresolved', type: 'checkbox', checked: caseView.filters?.include_unresolved !== false});
        const timeline = E('div', {id: 'case-timeline'});
        const filterForm = E('form', {class: 'case-filters'}, E('div', {class: 'case-filter-grid'}, field('Search this case', query), field('Protocol', protocol), field('Source', source)),
            E('details', {class: 'case-time-filters'}, E('summary', {}, 'Time range & unresolved events'), E('div', {class: 'form-grid'}, field('From · UTC', since), field('To · UTC', until)),
                E('label', {class: 'checkbox-row'}, unresolved, E('span', {}, 'Include events with unresolved times when no time range is set.'))),
            E('div', {class: 'case-filter-actions'}, E('p', {class: 'field-help'}, 'Search stays within this case. Times retain their original precision.'),
                E('button', {type: 'submit', class: 'button secondary small'}, icon('search'), 'Apply filters')));
        let timelineRequest = 0;
        async function updateTimeline(offset = 0) {
            const request = ++timelineRequest;
            const paginationFocus = timeline.contains(document.activeElement) ? document.activeElement.textContent.trim() : '';
            const asUtc = value => value ? `${value.length === 16 ? value + ':00' : value}Z` : '';
            const filters = {query: query.value.trim(), protocol: protocol.value, source_id: source.value ? Number(source.value) : null,
                since: asUtc(since.value), until: asUtc(until.value), include_unresolved: unresolved.checked, offset, limit: 50};
            caseView.filters = filters;
            filterForm.setAttribute('aria-busy', 'true');
            timeline.setAttribute('aria-busy', 'true');
            try {
                const result = await api('/api/case', {case_id: summary.case_id, ...filters});
                if (!current() || caseView.selected !== summary.case_id || request !== timelineRequest) return;
                drawTimeline(result.timeline);
                if (paginationFocus) {
                    const controls = [...timeline.querySelectorAll('.case-pagination button:not(:disabled)')];
                    (controls.find(control => control.textContent.trim() === paginationFocus) || controls[0])?.focus({preventScroll: true});
                }
                announce(`${count(result.timeline.total)} matching timeline events`);
            } catch (error) {if (current() && request === timelineRequest) toast(error.message, 'error');}
            finally {if (request === timelineRequest) {filterForm.setAttribute('aria-busy', 'false'); timeline.setAttribute('aria-busy', 'false');}}
        }
        function drawTimeline(result) {
            const rows = result.items || [];
            const range = result.total ? `${count(result.offset + 1)}–${count(result.offset + rows.length)} of ${count(result.total)} events` : 'No matching events';
            timeline.replaceChildren(E('div', {class: 'section-heading'}, E('p', {class: 'result-count', role: 'status'}, range), badge('Times in UTC')),
                rows.length ? E('div', {class: 'timeline-list'}, rows.map(row => {
                    const metrics = row.details?.metrics || {}, provenance = row.details?.provenance || {};
                    return E('article', {class: 'timeline-event'}, E('span', {class: 'timeline-dot', 'aria-hidden': 'true'}),
                        E('div', {class: 'timeline-event-body'}, E('p', {class: 'timeline-time'}, exactTime(eventTime(row))),
                            E('div', {class: 'timeline-event-title'}, E('strong', {}, human(metrics.kind)), badge(human(metrics.protocol))),
                            E('p', {class: 'muted'}, `Source ${display(provenance.source_id)} · Record ${display(provenance.ordinal)} · ${human(row.details?.time_status)}`)),
                    button('Provenance', () => openFinding(row.observation || row), 'ghost small', 'arrow'));
                })) : empty('No events match these filters', 'Try a wider time range, another protocol or a different search.', null, 'search'),
                E('div', {class: 'case-pagination'}, button('Previous', () => updateTimeline(Math.max(0, result.offset - result.limit)), 'secondary small', null, {disabled: result.offset === 0}),
                    E('span', {class: 'field-help'}, result.total ? `Page ${Math.floor(result.offset / result.limit) + 1}` : 'No pages'),
                    button('Next', () => updateTimeline(result.offset + result.limit), 'secondary small', null, {disabled: result.offset + rows.length >= result.total})));
        }
        filterForm.addEventListener('submit', event => {event.preventDefault(); updateTimeline();});
        host.replaceChildren(header, stats, card('Case timeline', 'Review the order of observations, then inspect their source references.', E('div', {}, filterForm, timeline)),
            renderCoverage(data.coverage || []), renderCaseSources(data.sources || [], summary));
        if ((data.findings || []).length) host.append(card('Review leads', 'Potential patterns to examine in context; these do not establish compromise.', E('div', {class: 'list'}, data.findings.map(row =>
            E('div', {class: 'list-row'}, E('div', {class: 'row-main'}, E('strong', {}, human(row.details?.metrics?.rule)),
                E('span', {class: 'muted'}, `${human(row.details?.metrics?.confidence_label)} confidence · ${human(row.details?.metrics?.source_severity)}`)),
            button('Review lead', () => openFinding(row), 'ghost small', 'arrow'))))));
        host.append(notice('A verified checksum establishes consistency with the supplied case, not authenticity. Pseudonyms are case scoped; observations and review leads require interpretation.'));
        drawTimeline(data.timeline);
    }

    function caseMetric(label, value) { return E('div', {}, E('span', {}, label), E('strong', {}, count(value))); }

    function renderCoverage(rows) {
        const coverage = rows[0]?.details || {}, metrics = coverage.metrics || {}, counts = coverage.counts || {};
        const distributions = (title, values) => E('div', {}, E('h3', {}, title), Object.keys(values || {}).length ? E('dl', {class: 'coverage-distribution'},
            Object.entries(values).map(([label, value]) => E('div', {}, E('dt', {}, human(label)), E('dd', {}, count(value))))) : E('p', {class: 'field-help'}, 'None reported.'));
        return card('What this analysis covers', 'Coverage makes gaps and decoding limits visible.', E('div', {class: 'panel-stack'},
            E('div', {class: 'coverage-metrics'}, caseMetric('Packet records', counts.packet_records), caseMetric('Observations', counts.observations), caseMetric('Flows', counts.flows), caseMetric('Parse errors', counts.parse_errors)),
            E('div', {class: 'coverage-grid'}, distributions('Decoded protocols', metrics.protocol_distribution), distributions('Decoding limitations', metrics.decoding_losses)),
            (metrics.rules || []).length ? E('div', {}, E('h3', {}, 'Rule coverage'), E('div', {class: 'list'}, metrics.rules.map(rule => E('div', {class: 'coverage-rule'},
                E('strong', {}, human(rule.rule)), badge(human(rule.status)), E('span', {class: 'muted'}, `${count(rule.eligible)} eligible · ${count(rule.findings)} leads`))))) : null,
            E('p', {class: 'field-help'}, 'This view uses the supported offline subset. Payload retention is off. It does not provide general reassembly or decryption.'),
            (coverage.limitations || []).length ? E('details', {}, E('summary', {}, 'Analysis limitations'), E('ul', {class: 'case-limitations'}, coverage.limitations.map(value => E('li', {}, value)))) : null));
    }

    function renderCaseSources(rows, summary) {
        return card('Sources & integrity', 'Hashes connect this view to the completed case and its preserved exchange.',
            E('details', {class: 'case-source-details'}, E('summary', {}, `${count(rows.length)} source files · View hashes and provenance`),
                E('dl', {class: 'metadata-list'}, keyValue('Exchange SHA-256', summary.exchange_sha256, true), keyValue('Checksum ledger SHA-256', summary.checksum_ledger_sha256, true), keyValue('Case namespace', summary.namespace, true)),
                E('div', {class: 'list'}, rows.map(row => E('div', {class: 'list-row'}, E('div', {class: 'row-main'},
                    E('strong', {}, `Source ${display(row.details?.provenance?.source_id)} · ${human(row.details?.metrics?.source_kind)}`),
                    E('span', {class: 'hash-value'}, row.details?.provenance?.source_sha256)), button('Provenance', () => openFinding(row), 'ghost small', 'arrow'))))));
    }

    async function exportCase(id) {
        try {const result = await api('/api/case-export', {case_id: id}); download(`honeytrace-case-${id.slice(0, 8)}.json`, JSON.stringify(result, null, 2)); toast('Minimized case exported. Original captures and private case keys stay on this machine.');}
        catch (error) {toast(error.message, 'error');}
    }

    async function openCapture() {
        const {dialog, body} = modal('Analyze a capture', 'Turn a local capture into a verified, searchable forensic case.');
        body.append(E('p', {class: 'muted'}, 'Checking the bundled analyzer…'));
        try {
            const result = await api('/api/cases');
            if (!dialog.open || !body.isConnected) return;
            const available = result.jobs?.available;
            const input = E('input', {id: 'capture-path', type: 'text', required: true, spellcheck: false, placeholder: '/absolute/path/to/capture.pcap'});
            const form = E('form', {class: 'panel-stack'}, chooseModuleNotice('sentinel'),
                !available ? notice('The bundled analyzer is unavailable. Check that your HoneyTrace source installation includes sentinel-forensics, or restart with a trusted checkout override.', 'info') : null,
                !available ? E('pre', {class: 'code-block'}, 'bash tools/launch-dashboard.sh --sentinel-root /absolute/path/to/sentinel-forensics') : null,
                field('Local capture path', input, 'Choose a PCAP or PCAPNG on the machine running this dashboard. Packet Squirrel captures use the same workflow.'),
                E('p', {class: 'field-help'}, 'The bundled Sentinel analyzer uses a private copy, keeps the original unchanged and runs in the background. Progress shows each stage. Completed output must pass case verification before it appears here.'),
                E('details', {class: 'help-panel'}, E('summary', {}, 'Supported size and analysis scope'), E('p', {class: 'muted'}, 'The current workflow accepts captures up to 64 MiB and runs for up to two minutes. Imported exchanges remain bounded to 8 MiB and 10,000 records. Larger captures can be analyzed separately; large-case browsing is a later increment. No live capture or active scanning is started.')),
                E('div', {class: 'modal-footer'}, button('Cancel', () => dialog.close(), 'secondary'),
                    E('button', {type: 'submit', class: 'button primary', disabled: !available || !enabled('sentinel')}, icon('pulse'), 'Start analysis')));
            form.addEventListener('submit', async event => {
                event.preventDefault(); setBusy(form, true);
                try {await api('/api/jobs', {input_path: input.value.trim()}); dialog.close(); navigate('cases'); toast('Capture analysis started. You can follow its progress in Forensic cases.');}
                catch (error) {toast(error.message, 'error');}
                finally {setBusy(form, false);}
            });
            body.replaceChildren(form);
        } catch (error) {if (dialog.open && body.isConnected) body.replaceChildren(notice(error.message, 'warning'));}
    }

    function renderDiagnostics(page) {
        page.append(pageHeader('A clear record of activity.', 'Review local operation events and share sanitized diagnostics when you need help.',
            button('Refresh diagnostics', () => navigate('diagnostics', false), 'secondary', 'refresh'),
            button('Export diagnostics', async () => {
                try {const result = await api('/api/diagnostics-export', {}); download('honeytrace-diagnostics.json', JSON.stringify(result, null, 2)); toast('Sanitized diagnostics exported. Evidence and raw sensor logs are separate.');}
                catch (error) {toast(error.message, 'error');}
            }, 'primary', 'download')));
        const host = E('div', {class: 'diagnostics-content'}, E('div', {class: 'loading-screen'}, E('span', {class: 'spinner'}), E('p', {}, 'Reading diagnostic events…')));
        page.append(host);
        const revision = caseView.request;
        api('/api/diagnostics').then(data => {
            if (!host.isConnected || ui.page !== 'diagnostics' || revision !== caseView.request) return;
            const entries = data.entries || [], logging = data.logging || {};
            const search = E('input', {id: 'diagnostic-search', type: 'search', placeholder: 'Search events, components or correlation IDs…', 'aria-label': 'Search diagnostics'});
            const level = E('select', {id: 'diagnostic-level', 'aria-label': 'Filter diagnostic level'}, E('option', {value: ''}, 'All levels'),
                [...new Set(entries.map(row => row.level))].sort().map(value => E('option', {value}, value)));
            const component = E('select', {id: 'diagnostic-component', 'aria-label': 'Filter diagnostic component'}, E('option', {value: ''}, 'All components'),
                [...new Set(entries.map(row => row.component))].sort().map(value => E('option', {value}, human(value))));
            const results = E('div');
            const countLabel = E('p', {class: 'result-count', role: 'status'});
            function draw() {
                const query = search.value.trim().toLowerCase();
                const filtered = entries.filter(row => (!level.value || row.level === level.value) && (!component.value || row.component === component.value) &&
                    (!query || [row.event, row.component, row.correlation_id, row.status, row.route, row.method, row.status_code, row.error_code].some(value => String(value || '').toLowerCase().includes(query))));
                countLabel.textContent = `${count(filtered.length)} of ${count(entries.length)} recent events`;
                results.replaceChildren(filtered.length ? E('div', {class: 'table-wrap'}, E('table', {class: 'data-table diagnostics-table'},
                    E('thead', {}, E('tr', {}, ['Time', 'Level', 'Component / event', 'Result', ''].map(value => E('th', {scope: 'col'}, value)))),
                    E('tbody', {}, filtered.map(row => E('tr', {}, E('td', {class: 'muted', title: row.timestamp}, formatDate(row.timestamp, true)),
                        E('td', {}, badge(row.level, ['ERROR', 'CRITICAL'].includes(row.level) ? 'warning' : 'neutral')),
                        E('td', {}, E('strong', {}, human(row.event?.replaceAll('.', ' '))), E('span', {class: 'row-meta'},
                            `${human(row.component)}${row.route ? ` · ${row.method || ''} ${row.route}` : ''}`)),
                        E('td', {}, row.status_code ? `HTTP ${row.status_code}` : human(row.status || row.error_code || 'recorded'),
                            typeof row.duration_ms === 'number' ? E('span', {class: 'row-meta'}, `${row.duration_ms.toFixed(1)} ms`) : null),
                        E('td', {class: 'table-actions'}, button('Details', () => openDiagnostic(row), 'ghost small', 'arrow'))))))) :
                    empty(entries.length ? 'No matching events' : 'No diagnostic events yet', entries.length ? 'Try another filter or search.' : 'Recorded operations will appear here. Refresh after using a workflow.', null, 'file'));
            }
            search.addEventListener('input', draw); level.addEventListener('change', draw); component.addEventListener('change', draw);
            host.replaceChildren(...[
                logging.status === 'unavailable' ? notice('Diagnostic logging is unavailable. Some activity may not have been recorded. Check the private workspace and refresh.', 'warning') : null,
                E('div', {class: 'stats-grid'}, E('section', {class: 'stat-card'}, E('div', {class: 'stat-label'}, E('span', {}, 'Logging'), icon('file')),
                    E('p', {class: 'posture-value'}, human(logging.status)), E('p', {class: 'muted'}, `Minimum level: ${display(logging.level)}`)),
                    stat('Recent events', entries.length, 'Bounded activity history', 'clock'), stat('Write failures', logging.write_failures, 'Failures observed by this process', 'info')),
                E('section', {class: 'card'}, E('div', {class: 'toolbar'}, E('div', {class: 'search-wrap'}, icon('search', 'search-icon'), search), level, component),
                    E('div', {class: 'card-body'}, E('div', {class: 'section-heading'}, E('h2', {class: 'card-title'}, 'Operation events'), countLabel), results)),
                notice('These diagnostics record operations and outcomes. Captured content, original evidence, credentials and raw sensor logs are kept out of this view.')].filter(Boolean));
            draw();
        }).catch(error => {if (host.isConnected && ui.page === 'diagnostics' && revision === caseView.request) host.replaceChildren(empty('Diagnostics are unavailable', error.message,
            button('Try again', () => navigate('diagnostics', false), 'secondary', 'refresh')));});
    }

    function openDiagnostic(row) {
        const {body} = modal('Diagnostic event', 'A sanitized operation record from this workspace.');
        body.append(E('dl', {class: 'metadata-list'}, keyValue('Event', human(row.event?.replaceAll('.', ' '))), keyValue('Component', human(row.component)),
            keyValue('Timestamp', row.timestamp, true), keyValue('Level', row.level), keyValue('Correlation ID', row.correlation_id, true),
            keyValue('Duration', row.duration_ms === undefined ? 'Not recorded' : `${row.duration_ms} ms`)),
            E('details', {class: 'help-panel'}, E('summary', {}, 'Sanitized record'), E('pre', {class: 'code-block'}, JSON.stringify(row, null, 2))));
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

    function renderSecurity(page) {
        const exportButton = button('Export review', async () => {
            try {const report = await api('/api/security-report', {import_ids: securityView.importIds}); download('honeytrace-security-review.json', JSON.stringify(report, null, 2)); toast('Security review exported with source observations and operator triage.');}
            catch (error) {toast(error.message, 'error');}
        }, 'secondary', 'download', {disabled: true});
        page.append(pageHeader('Security review', 'Turn approved assessment reports into a focused review, with every source observation kept intact.', exportButton));
        const host = E('div', {id: 'security-workspace'}, E('div', {class: 'loading-screen'}, E('span', {class: 'spinner'}), E('p', {}, 'Reading assessment reports…')));
        page.append(host);
        const revision = caseView.request;
        const current = () => host.isConnected && ui.page === 'security' && revision === caseView.request;
        api('/api/review-imports').then(data => {
            if (!current()) return;
            const imports = data.imports || [];
            if (!data.available || !imports.length) {
                const reasons = {offline_imports_disabled: 'Enable offline imports and the Nmap or Nuclei module in Settings.',
                    assessment_not_approved: 'Confirm assessment approval in Settings before reviewing these reports.',
                    scope_required: 'Add the assets covered by your approved assessment to the scope in Settings.',
                    assessment_modules_disabled: 'Enable Nmap or Nuclei in Settings to review assessment reports.'};
                host.replaceChildren(empty('Start with an approved report', reasons[data.reason] || 'Import a Nmap XML or Nuclei JSONL report for assets you are authorized to assess.',
                    E('div', {class: 'actions'}, button('Open settings', () => navigate('settings'), 'primary', 'settings'),
                        button('Import Nmap', () => openImport('nmap'), 'secondary', 'upload'), button('Import Nuclei', () => openImport('nuclei'), 'secondary', 'upload')), 'shield'),
                    notice('Review uses existing offline reports. It does not run a scanner or send indicators to an external service.'));
                return;
            }
            securityView.importIds = securityView.importIds.filter(id => imports.some(item => item.import_id === id));
            const controls = new Map();
            const selectionLabel = E('p', {class: 'field-help', role: 'status'});
            const loadButton = button('Load selected reports', () => loadReview(0), 'primary', 'search');
            const query = E('input', {id: 'security-search', type: 'search', value: securityView.query, placeholder: 'Search observations and review notes…'});
            const asset = E('select', {id: 'security-asset'}, E('option', {value: ''}, 'All exact assets'));
            const status = E('select', {id: 'security-status', value: securityView.status}, E('option', {value: 'all'}, 'All review statuses'),
                Object.entries(triageStatuses).map(([value, label]) => E('option', {value}, label)));
            const stats = E('div');
            const scope = E('div');
            const results = E('div', {id: 'security-items', class: 'security-items'});
            const pagination = E('div', {class: 'case-pagination'});
            const initial = empty('Choose the reports you want to review', 'Select one or more approved reports, then load them to see exact assets and prioritized observations.', null, 'search');
            const filterForm = E('form', {class: 'security-filters'}, E('div', {class: 'case-filter-grid'}, field('Search this review', query), field('Exact asset', asset), field('Review status', status)),
                E('div', {class: 'actions'}, E('button', {type: 'submit', class: 'button secondary small'}, icon('search'), 'Apply filters')));
            const review = E('div', {class: 'security-review', hidden: true}, stats, scope, filterForm, results, pagination);
            let request = 0;
            const selection = imports.map(item => {
                const input = E('input', {type: 'checkbox', value: item.import_id, checked: securityView.importIds.includes(item.import_id)});
                controls.set(item.import_id, input);
                input.addEventListener('change', () => {
                    if (input.checked && [...controls.values()].filter(control => control.checked).length > 20) {input.checked = false; toast('Select up to 20 reports for one review.', 'error'); return;}
                    securityView.importIds = [...controls].filter(([, control]) => control.checked).map(([id]) => id);
                    securityView.asset_id = null; securityView.offset = 0; asset.value = '';
                    request++; review.hidden = true; initial.hidden = false; exportButton.disabled = true;
                    updateSelection();
                });
                return E('label', {class: 'review-import-option'}, input, E('span', {}, E('strong', {}, `${moduleInfo(item.plugin_id)[0]} · ${String(item.import_id).slice(0, 8)}`),
                    E('span', {class: 'field-help'}, `${formatDate(item.imported_at)} · ${count(item.records)} records`)));
            });
            function updateSelection() {selectionLabel.textContent = `${count(securityView.importIds.length)} selected · up to 20 reports`; loadButton.disabled = !securityView.importIds.length;}
            async function loadReview(offset = 0) {
                if (!current() || !securityView.importIds.length) return;
                const sequence = ++request;
                const focusLabel = pagination.contains(document.activeElement) ? document.activeElement.textContent.trim() : '';
                securityView.query = query.value.trim(); securityView.status = status.value; securityView.asset_id = asset.value || null; securityView.offset = offset;
                const selectionKey = securityView.importIds.slice().sort().join(':');
                review.setAttribute('aria-busy', 'true'); loadButton.disabled = true;
                try {
                    const result = await api('/api/security-review', {import_ids: securityView.importIds, query: securityView.query, asset_id: securityView.asset_id, status: securityView.status, offset, limit: 50});
                    if (!current() || sequence !== request || selectionKey !== securityView.importIds.slice().sort().join(':')) return;
                    if (result.complete !== true) throw new Error('The selected review is incomplete. Check the reports and try again.');
                    asset.replaceChildren(E('option', {value: ''}, 'All exact assets'), ...(result.assets || []).map(item => E('option', {value: item.asset_id}, `${item.value} · ${count(item.open_reviews)} open`)));
                    asset.value = securityView.asset_id || '';
                    stats.replaceChildren(E('div', {class: 'stats-grid'}, stat('Selected reports', result.counts.selected_imports, 'Approved source reports in this review', 'folder'),
                        stat('Exact assets', result.counts.assets, `${count(result.counts.observations)} source observations`, 'search'),
                        stat('Open reviews', result.counts.open_reviews, 'Operator review, separate from source evidence', 'shield')));
                    scope.replaceChildren(...(result.counts.excluded_scope ? [notice(`${count(result.counts.excluded_scope)} observations were excluded by the current asset scope.`, 'warning')] : []));
                    results.replaceChildren(...(result.items.length ? result.items.map(item => securityReviewCard(item, () => loadReview(securityView.offset))) :
                        [empty('No matching observations', 'Try a different asset, review status or search.', null, 'search')]));
                    const pages = result.pagination;
                    pagination.replaceChildren(button('Previous', () => loadReview(Math.max(0, pages.offset - pages.limit)), 'secondary small', null, {disabled: pages.offset === 0}),
                        E('span', {class: 'field-help', role: 'status'}, pages.total ? `${count(pages.offset + 1)}–${count(pages.offset + result.items.length)} of ${count(pages.total)}` : 'No results'),
                        button('Next', () => loadReview(pages.offset + pages.limit), 'secondary small', null, {disabled: pages.offset + result.items.length >= pages.total}));
                    initial.hidden = true; review.hidden = false; exportButton.disabled = false;
                    if (focusLabel) [...pagination.querySelectorAll('button:not(:disabled)')].find(control => control.textContent.trim() === focusLabel)?.focus({preventScroll: true});
                    announce(`${count(pages.total)} matching security observations`);
                } catch (error) {if (current() && sequence === request) toast(error.message, 'error');}
                finally {if (current() && sequence === request) {review.setAttribute('aria-busy', 'false'); updateSelection();}}
            }
            filterForm.addEventListener('submit', event => {event.preventDefault(); loadReview(0);});
            host.replaceChildren(card('Choose source reports', 'Review existing Nmap and Nuclei imports within your approved scope.',
                E('div', {class: 'panel-stack'}, E('div', {class: 'review-import-list'}, selection), E('div', {class: 'section-heading'}, selectionLabel, loadButton))), initial, review,
                notice('Assets are grouped by exact recorded values. Review status is your assessment: “Resolved” does not verify a rescan, and an observed open port does not establish compromise.'));
            updateSelection();
        }).catch(error => {if (current()) host.replaceChildren(empty('Security review is unavailable', error.message,
            button('Try again', () => navigate('security', false), 'secondary', 'refresh')));});
    }

    function securityReviewCard(item, reload) {
        const reasons = {collection_error: 'Review the reported collection error before relying on this observation.', reported_high_severity: 'The source report assigns high severity.',
            reported_medium_severity: 'The source report assigns medium severity.', reported_low_or_unknown_severity: 'The source reports low or unassigned severity.',
            informational_observation: 'An informational observation for context.', open_service_observed: 'The source observed an open service; review its expected exposure.',
            service_state_uncertain: 'The source does not establish the service state.', host_status_observed: 'The source recorded a host-status observation.', service_state_observed: 'The source recorded a service-state observation.'};
        const source = item.source;
        return E('article', {class: 'security-review-card', 'data-review-id': item.review_id}, E('div', {class: 'security-review-heading'},
            E('div', {}, E('p', {class: 'eyebrow'}, moduleInfo(source.source_tool)[0]), E('h3', {}, source.indicator_value)),
            E('div', {class: 'actions'}, badge(human(item.priority), ['high', 'collection_issue'].includes(item.priority) ? 'warning' : 'neutral'), badge(triageStatuses[item.triage.status] || human(item.triage.status)))),
            E('p', {class: 'muted'}, reasons[item.reason_code] || human(item.reason_code)),
            item.review_steps?.length ? E('ul', {class: 'review-next-steps'}, item.review_steps.map(step => E('li', {}, step))) : null,
            item.triage.note ? E('div', {class: 'triage-note'}, E('strong', {}, 'Operator note'), E('p', {}, item.triage.note)) : null,
            E('div', {class: 'equipment-actions'}, button('Source provenance', () => openFinding(source), 'secondary small', 'folder'),
                button('Update review', () => openTriage(item, reload), 'secondary small', 'check'),
                E('span', {class: 'field-help'}, item.triage.updated_at ? `Reviewed ${formatDate(item.triage.updated_at)}` : 'Awaiting operator review')));
    }

    function openTriage(item, reload) {
        const {dialog, body} = modal('Update operator review', item.source.indicator_value);
        const status = E('select', {id: 'triage-status', value: item.triage.status}, Object.entries(triageStatuses).map(([value, label]) => E('option', {value}, label)));
        const note = E('textarea', {id: 'triage-note', rows: 4, maxlength: 512, value: item.triage.note || '', placeholder: 'Record your interpretation and follow-up.'});
        const form = E('form', {class: 'panel-stack'}, field('Review status', status), field('Operator note', note, 'Up to 512 characters. Source observations remain unchanged.'),
            notice('This records your review decision. “Resolved” does not establish that a new scan or verification has occurred.'),
            E('div', {class: 'modal-footer'}, button('Cancel', () => dialog.close(), 'secondary'), E('button', {type: 'submit', class: 'button primary'}, icon('check'), 'Save review')));
        form.addEventListener('submit', async event => {
            event.preventDefault(); setBusy(form, true);
            try {await api('/api/security-triage', {import_id: item.import_id, finding_id: item.source.finding_id, status: status.value, note: note.value.trim()});
                dialog.close(); await reload(); toast('Operator review saved. Source evidence is unchanged.');}
            catch (error) {toast(error.message, 'error');}
            finally {setBusy(form, false);}
        });
        body.append(form);
    }

    function renderEquipment(page) {
        page.append(pageHeader('My equipment', 'Give your hardware, tools and sensors a clear place in your workspace.',
            button('Refresh status', () => navigate('equipment', false), 'secondary', 'refresh'),
            button('Add equipment', () => openEquipment(), 'primary', 'plug')));
        const host = E('div', {id: 'equipment-workspace'}, E('div', {class: 'loading-screen'}, E('span', {class: 'spinner'}), E('p', {}, 'Reading your equipment…')));
        page.append(host);
        const revision = caseView.request;
        api('/api/equipment').then(data => {
            if (!host.isConnected || ui.page !== 'equipment' || revision !== caseView.request) return;
            let entries = data.equipment || [];
            const search = E('input', {id: 'equipment-search', type: 'search', placeholder: 'Search names and descriptions…', 'aria-label': 'Search equipment', value: equipmentView.query});
            const category = E('select', {id: 'equipment-category-filter', 'aria-label': 'Filter equipment category', value: equipmentView.category}, E('option', {value: ''}, 'All categories'),
                ['hardware', 'tool', 'sensor'].map(value => E('option', {value}, human(value))));
            const equipmentClass = E('select', {id: 'equipment-class-filter', 'aria-label': 'Filter equipment class', value: equipmentView.equipment_class}, E('option', {value: ''}, 'All classes'),
                [...new Set(entries.map(entry => entry.equipment_class).filter(Boolean))].sort().map(value => E('option', {value}, value)));
            const status = E('select', {id: 'equipment-status-filter', 'aria-label': 'Filter equipment status', value: equipmentView.status}, E('option', {value: ''}, 'All statuses'),
                ['operational', 'degraded', 'offline', 'unknown', 'inactive', 'ready'].map(value => E('option', {value}, human(value))));
            const results = E('div', {id: 'equipment-list', class: 'equipment-grid'});
            const countLabel = E('p', {class: 'result-count', role: 'status'});
            const refreshState = E('p', {class: 'field-help', role: 'status'}, 'Status observations refresh every 15 seconds.');
            const clear = () => {equipmentView.query = search.value = ''; equipmentView.category = category.value = ''; equipmentView.status = status.value = ''; equipmentView.equipment_class = equipmentClass.value = ''; draw();};
            function draw() {
                const query = search.value.trim().toLowerCase();
                equipmentView.query = search.value; equipmentView.category = category.value; equipmentView.status = status.value; equipmentView.equipment_class = equipmentClass.value;
                const filtered = entries.filter(entry => (!category.value || entry.category === category.value) &&
                    (!status.value || entry.operational?.status === status.value) && (!equipmentClass.value || entry.equipment_class === equipmentClass.value) &&
                    (!query || [entry.name, entry.description, entry.equipment_class, entry.value].some(value => String(value || '').toLowerCase().includes(query))));
                countLabel.textContent = `${count(filtered.length)} of ${count(entries.length)} entries`;
                results.replaceChildren(...(filtered.length ? filtered.map(equipmentCard) : [empty(entries.length ? 'No equipment matches' : 'Your setup, at a glance',
                    entries.length ? 'Clear the filters or try a different name.' : 'Add a label and description for your first device, tool or sensor. Choose how its status should be tracked.',
                    entries.length ? button('Clear filters', clear, 'secondary', 'refresh') : button('Add your first entry', () => openEquipment(), 'primary', 'plug'))]));
            }
            search.addEventListener('input', draw); category.addEventListener('change', draw); status.addEventListener('change', draw); equipmentClass.addEventListener('change', draw);
            const attention = entries.filter(entry => entry.active && ['degraded', 'offline', 'unknown'].includes(entry.operational?.status)).length;
            host.replaceChildren(E('div', {class: 'stats-grid'}, stat('Inventory entries', entries.length, 'Your labeled hardware, tools and sensors', 'plug'),
                stat('Marked active', entries.filter(entry => entry.active).length, 'Entries included in your current setup', 'check'),
                stat('Needs review', attention, 'Reported issues or an unknown active status', 'info')),
                notice('Status always shows its source and observation time. Manual reports describe what you observed; saved telemetry can become stale. Analyzer “Ready” means installed and available.'),
                E('div', {class: 'toolbar equipment-toolbar'}, E('div', {class: 'search-wrap'}, icon('search', 'search-icon'), search), category, equipmentClass, status),
                E('div', {class: 'section-heading'}, E('h2', {class: 'card-title'}, 'Equipment inventory'), countLabel), results, refreshState);
            draw();
            const current = () => host.isConnected && ui.page === 'equipment' && revision === caseView.request;
            async function pollStatus() {
                if (!current()) return;
                try {
                    if ($('dialog[open]')) return;
                    const latest = await api('/api/equipment');
                    if (!current() || $('dialog[open]')) return;
                    const previous = new Map(entries.map(entry => [entry.id, entry]));
                    entries = (latest.equipment || []).map(entry => Object.assign(previous.get(entry.id) || {}, entry));
                    if (results.contains(document.activeElement)) {
                        for (const item of results.querySelectorAll('[data-equipment-id]')) {
                            const entry = entries.find(value => value.id === item.dataset.equipmentId);
                            if (!entry) continue;
                            const fresh = equipmentCard(entry);
                            item.querySelector('.equipment-card-heading').replaceWith(fresh.querySelector('.equipment-card-heading'));
                            item.querySelector('.equipment-observation').replaceWith(fresh.querySelector('.equipment-observation'));
                        }
                    } else draw();
                    const values = [entries.length, entries.filter(entry => entry.active).length,
                        entries.filter(entry => entry.active && ['degraded', 'offline', 'unknown'].includes(entry.operational?.status)).length];
                    host.querySelectorAll('.stats-grid .stat-number').forEach((element, index) => {element.textContent = count(values[index]);});
                    refreshState.textContent = 'Status observations refreshed. Automatic refresh runs every 15 seconds.';
                } catch (_) {if (current()) refreshState.textContent = 'Status refresh is unavailable. Displayed values reflect the last observation; use Refresh status to retry.';}
                finally {if (current()) caseView.poll = setTimeout(pollStatus, 15000);}
            }
            caseView.poll = setTimeout(pollStatus, 15000);
        }).catch(error => {if (host.isConnected && ui.page === 'equipment' && revision === caseView.request) host.replaceChildren(empty('Equipment is unavailable', error.message,
            button('Try again', () => navigate('equipment', false), 'secondary', 'refresh')));});
    }

    function equipmentCard(entry) {
        const operational = entry.operational || {};
        const sources = {manual: 'Manual report', heartbeat: 'Heartbeat report', saved_telemetry: 'Saved telemetry', local_analyzer: 'Local analyzer availability'};
        const reportable = ['manual', 'heartbeat'].includes(entry.tracking);
        return E('article', {class: `equipment-card${entry.active ? '' : ' equipment-inactive'}`, 'data-equipment-id': entry.id},
            E('div', {class: 'equipment-card-heading'}, E('span', {class: 'module-icon'}, icon(({hardware: 'radio', tool: 'plug', sensor: 'pulse'})[entry.category] || 'plug')),
                E('div', {}, E('h3', {}, entry.name), E('p', {class: 'row-meta'}, `${human(entry.category)}${entry.equipment_class ? ` · ${entry.equipment_class}` : ''} · ${entry.active ? 'Marked active' : 'Inactive in inventory'}`)),
                badge(human(operational.status || 'unknown'), operational.status === 'operational' ? 'success' : ['degraded', 'offline'].includes(operational.status) ? 'warning' : 'neutral')),
            E('p', {class: 'equipment-description'}, entry.description || 'No description added.'),
            entry.value ? E('p', {class: 'equipment-value'}, E('span', {}, 'Value'), E('strong', {}, entry.value)) : null,
            E('div', {class: 'equipment-observation'}, E('strong', {}, sources[operational.source] || 'Status source unavailable'),
                E('p', {}, operational.observed_at ? `Observed ${formatDate(operational.observed_at)}` : 'No observation recorded yet'),
                operational.stale ? badge('Stale observation', 'warning') : null,
                E('p', {class: 'equipment-status-note'}, operational.note || equipmentTracking[entry.tracking]?.[1] || 'Status is not established.')),
            E('div', {class: 'equipment-actions'}, button('Edit', () => openEquipment(entry), 'secondary small', 'settings'),
                reportable ? button('Report status', () => reportEquipment(entry), 'secondary small', 'pulse') : null,
                button('Remove entry', () => removeEquipment(entry), 'ghost small', 'close')));
    }

    function openEquipment(entry = null) {
        const {dialog, body} = modal(entry ? 'Edit equipment' : 'Add equipment', 'Keep a labeled inventory of the hardware, tools and sensors in your setup.');
        const name = E('input', {id: 'equipment-name', type: 'text', required: true, maxlength: 80, value: entry?.name || '', placeholder: 'For example: Lab capture adapter'});
        const description = E('textarea', {id: 'equipment-description', rows: 3, maxlength: 500, value: entry?.description || '', placeholder: 'What it does and where it fits in your setup.'});
        const equipmentClass = E('input', {id: 'equipment-class', type: 'text', maxlength: 80, value: entry?.equipment_class || '', placeholder: 'For example: BLE Scanners', list: 'equipment-class-options'});
        const value = E('input', {id: 'equipment-value', type: 'text', maxlength: 80, value: entry?.value || '', placeholder: 'For example: $49.99 or a reference'});
        const category = E('select', {id: 'equipment-category', value: entry?.category || 'hardware'}, ['hardware', 'tool', 'sensor'].map(value => E('option', {value}, human(value))));
        const tracking = E('select', {id: 'equipment-tracking', value: entry?.tracking || 'manual'}, Object.entries(equipmentTracking).map(([value, [label]]) => E('option', {value}, label)));
        const active = E('input', {id: 'equipment-active', type: 'checkbox', checked: entry?.active ?? true});
        const trackingHelp = E('p', {class: 'field-help'});
        const updateHelp = () => {trackingHelp.textContent = equipmentTracking[tracking.value]?.[1] || '';};
        tracking.addEventListener('change', updateHelp); updateHelp();
        const form = E('form', {class: 'panel-stack'}, field('Name', name), field('Description', description),
            E('div', {class: 'form-grid'}, field('Category', category), field('Class', equipmentClass, 'Choose your own grouping.')),
            E('datalist', {id: 'equipment-class-options'}, ['BLE Scanners', 'Wi-Fi Adapters', 'ESP32', 'Capture Devices', 'Security Tools'].map(label => E('option', {value: label}))),
            E('div', {class: 'form-grid'}, field('Value (optional)', value, 'Free text for a price, value or reference.'), field('Status tracking', tracking)), trackingHelp,
            E('label', {class: 'checkbox-row'}, active, E('span', {}, 'Active in my setup', E('span', {class: 'field-help'}, 'An inventory label; changing it does not start or stop equipment.'))),
            E('div', {class: 'modal-footer'}, button('Cancel', () => dialog.close(), 'secondary'), E('button', {type: 'submit', class: 'button primary'}, icon('check'), 'Save equipment')));
        form.addEventListener('submit', async event => {
            event.preventDefault(); setBusy(form, true);
            try {await api('/api/equipment-save', {name: name.value.trim(), description: description.value.trim(), category: category.value, equipment_class: equipmentClass.value.trim(), value: value.value.trim(), active: active.checked, tracking: tracking.value, ...(entry ? {id: entry.id} : {})});
                dialog.close(); navigate('equipment'); toast('Equipment entry saved.');}
            catch (error) {toast(error.message, 'error');}
            finally {setBusy(form, false);}
        });
        body.append(form);
    }

    function reportEquipment(entry) {
        const {dialog, body} = modal('Report equipment status', entry.name);
        const status = E('select', {id: 'equipment-report-status', value: entry.reported_status || 'unknown'},
            ['operational', 'degraded', 'offline', 'unknown'].map(value => E('option', {value}, human(value))));
        const form = E('form', {class: 'panel-stack'}, field('Observed status', status),
            E('p', {class: 'field-help'}, entry.tracking === 'heartbeat' ? 'This report records a new heartbeat now. When it becomes stale, the equipment status returns to unknown.' : 'This records your observation and its time. It does not run a hardware or service probe.'),
            E('div', {class: 'modal-footer'}, button('Cancel', () => dialog.close(), 'secondary'), E('button', {type: 'submit', class: 'button primary'}, icon('pulse'), 'Record status')));
        form.addEventListener('submit', async event => {
            event.preventDefault(); setBusy(form, true);
            try {await api('/api/equipment-report', {id: entry.id, status: status.value}); dialog.close(); navigate('equipment'); toast('Status report recorded.');}
            catch (error) {toast(error.message, 'error');}
            finally {setBusy(form, false);}
        });
        body.append(form);
    }

    function removeEquipment(entry) {
        const {dialog, body} = modal('Remove equipment entry?', entry.name);
        const confirm = button('Remove entry', async () => {
            confirm.disabled = true;
            try {await api('/api/equipment-remove', {id: entry.id}); dialog.close(); navigate('equipment'); toast('Inventory entry removed.');}
            catch (error) {toast(error.message, 'error'); if (confirm.isConnected) confirm.disabled = false;}
        }, 'danger', 'close');
        body.append(E('p', {class: 'muted'}, 'Only this inventory record is removed. The equipment and its saved telemetry remain unchanged.'),
            E('div', {class: 'modal-footer'}, button('Keep entry', () => dialog.close(), 'secondary'), confirm));
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
        const identities = E('div', {}, E('p', {class: 'muted'}, 'Reading available profiles…'));
        page.append(card('Decoy identity', 'Prepare a consistent presentation for your decoy services.', identities));
        loadDecoyProfiles(identities);
        page.append(notice(posture.note || 'Saved observations do not establish current runtime qualification. Service startup and containment remain in the existing operator workflow.'));
    }

    async function loadDecoyProfiles(host) {
        const revision = caseView.request;
        try {
            const data = await api('/api/decoys');
            if (!host.isConnected || ui.page !== 'honeypot' || revision !== caseView.request) return;
            const profiles = data.profiles || [];
            if (!profiles.length) {host.replaceChildren(E('p', {class: 'field-help'}, 'No decoy identity profiles are available.')); return;}
            const choice = E('select', {id: 'decoy-profile'}, profiles.map(profile => E('option', {value: profile.id}, profile.name)));
            const description = E('p', {class: 'field-help'});
            const prepared = E('div', {id: 'decoy-prepared'});
            const form = E('form', {class: 'panel-stack'}, field('Identity profile', choice), description,
                E('div', {class: 'actions'}, E('button', {type: 'submit', class: 'button secondary'}, icon('shield'), 'Prepare profile')));
            const describe = () => {description.textContent = profiles.find(profile => profile.id === choice.value)?.description || ''; prepared.replaceChildren();};
            choice.addEventListener('change', describe);
            describe();
            form.addEventListener('submit', async event => {
                event.preventDefault(); setBusy(form, true);
                try {
                    const result = await api('/api/decoy-profile', {profile_id: choice.value});
                    if (!host.isConnected || ui.page !== 'honeypot' || revision !== caseView.request) return;
                    prepared.replaceChildren(E('div', {class: 'panel-stack'}, badge('Prepared configuration', 'success'),
                        E('p', {class: 'field-help'}, result.note || 'Review and download these files. Applying the profile and restarting services remain separate operator actions.'),
                        (result.files || []).map(file => E('section', {class: 'prepared-profile-file'},
                            E('div', {class: 'section-heading'}, E('strong', {}, file.name), button('Download file', () => download(file.name, file.content, 'text/plain;charset=utf-8'), 'secondary small', 'download')),
                            E('p', {class: 'hash-value'}, `SHA-256: ${file.sha256}`), E('details', {}, E('summary', {}, 'Review configuration'), E('pre', {class: 'code-block'}, file.content))))));
                    announce('Decoy profile prepared for review.');
                } catch (error) {toast(error.message, 'error');}
                finally {setBusy(form, false);}
            });
            const privacy = data.privacy || {};
            host.replaceChildren(E('div', {class: 'panel-stack'}, form, prepared,
                E('p', {class: 'field-help'}, data.note || 'Preparation changes presentation settings only. Runtime service configuration is not applied here.'),
                E('details', {class: 'help-panel'}, E('summary', {}, 'Local dashboard privacy'), E('dl', {class: 'metadata-list'},
                    keyValue('Management access', privacy.loopback_only === true ? 'Loopback only' : 'Not reported'),
                    keyValue('Session access', privacy.session_auth === true ? 'Session token required' : 'Not reported'),
                    keyValue('Server fingerprint header', privacy.server_header === false ? 'Suppressed' : 'Not reported'),
                    keyValue('Third-party assets', privacy.third_party_assets === false ? 'None loaded' : 'Not reported')))));
        } catch (error) {if (host.isConnected && ui.page === 'honeypot' && revision === caseView.request) host.replaceChildren(notice(error.message, 'warning'));}
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
            E('details', {class: 'help-panel'}, E('summary', {}, 'About PCAP and Packet Squirrel analysis'), E('p', {class: 'muted'}, 'Use Analyze a capture in Forensic cases to run the bundled Sentinel analyzer on a small local capture. You can also analyze captures separately and import the completed case here. Packet Squirrel uses the same PCAP workflow.')),
            E('div', {class: 'modal-footer'}, button('Cancel', () => dialog.close(), 'secondary'), E('button', {type: 'submit', class: 'button primary', disabled: !enabled('sentinel')}, icon('folder'), 'Verify & import case')));
        form.addEventListener('submit', async event => {
            event.preventDefault(); setBusy(form, true);
            try {const result = await api('/api/sentinel', {bundle_path: folder.value.trim()}); dialog.close(); await refresh(); openCase(result.manifest.import_id); toast(importMessage(result.manifest));}
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
            helpDetail('How do forensic cases work?', 'Open Forensic cases to analyze a local PCAP or PCAPNG with the bundled Sentinel analyzer, or import a completed case. Review its timeline, filter within that case and inspect coverage and source hashes. Analysis runs in the background and can be cancelled. Unresolved times appear after timed events and are excluded when you set a time range.'),
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
