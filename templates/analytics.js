(() => {
  'use strict';
  window.SkynetTemplates = window.SkynetTemplates || {};
  window.SkynetTemplates.analytics = {
    mount(root, api) {
      const db = api.data || {};
      const records = Array.isArray(db.records) ? db.records : [];
      const esc = api.escape;
      const icon = api.icon;
      const num = value => api.number(value);
      const missing = 'Not set';
      const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
      const shortDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
      let platformFilter = '';
      let statusFilter = '';
      let view = 'charts';
      let destroyed = false;

      const field = (record, key) => record.fields?.[key] == null || record.fields[key] === '' ? missing : String(record.fields[key]);
      const platforms = record => {
        const value = record.fields?.platforms;
        return [...new Set((Array.isArray(value) ? value : value ? [value] : []).map(String).filter(Boolean))];
      };
      const dateKey = value => {
        const parsed = new Date(value);
        if (!value || Number.isNaN(parsed.getTime())) return null;
        const parts = Object.fromEntries(dateFormatter.formatToParts(parsed).map(part => [part.type, part.value]));
        return `${parts.year}-${parts.month}-${parts.day}`;
      };
      const labelDate = key => shortDate.format(new Date(`${key}T12:00:00Z`));
      const title = record => field(record, 'title') === missing ? 'Untitled record' : field(record, 'title');
      const count = values => {
        const result = new Map();
        values.forEach(value => result.set(value, (result.get(value) || 0) + 1));
        return [...result].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
      };
      const allStatuses = count(records.map(record => field(record, 'status'))).map(item => item.label);
      const allPlatforms = count(records.flatMap(platforms)).map(item => item.label);
      const dates = records.map(record => dateKey(record.updated_at)).filter(Boolean).sort();
      const dateDomain = [];
      if (dates.length) {
        const first = Date.parse(dates[0] + 'T12:00:00Z');
        const last = Date.parse(dates[dates.length - 1] + 'T12:00:00Z');
        const days = Math.round((last - first) / 86400000) + 1;
        if (days <= 90) {
          for (let day = first; day <= last; day += 86400000) dateDomain.push(new Date(day).toISOString().slice(0, 10));
        } else dateDomain.push(...new Set(dates));
      }
      const percentage = (value, total) => total ? `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(value / total * 100)}%` : '0%';
      const selected = () => records.filter(record => (!platformFilter || platforms(record).includes(platformFilter)) && (!statusFilter || field(record, 'status') === statusFilter));
      const color = index => `var(--analytics-color-${index % 6})`;

      function aggregate(rows) {
        const updatedCounts = new Map();
        rows.forEach(record => {
          const key = dateKey(record.updated_at);
          if (key) updatedCounts.set(key, (updatedCounts.get(key) || 0) + 1);
        });
        const tier = count(rows.map(record => field(record, 'idea_tier')));
        return {
          rows,
          updates: dateDomain.map(label => ({ label, value: updatedCounts.get(label) || 0 })),
          status: count(rows.map(record => field(record, 'status'))),
          tier,
          platforms: count(rows.flatMap(platforms)),
          missingUpdated: rows.filter(record => !dateKey(record.updated_at)).length,
          missingAdded: rows.filter(record => !dateKey(record.fields?.date_added)).length,
          missingTier: tier.find(item => item.label === missing)?.value || 0,
        };
      }

      function filterOptions(values, selectedValue, allLabel) {
        return `<option value="">${allLabel}</option>${values.map(value => `<option value="${esc(value)}"${selectedValue === value ? ' selected' : ''}>${esc(value)}</option>`).join('')}`;
      }

      function renderShell() {
        root.innerHTML = `<section class="analytics-template" aria-label="Content analytics">
          <header class="analytics-heading"><div><h2>Content, at a glance.</h2><p>Statuses, priorities and platform coverage across the included ideas.</p></div><span class="analytics-scope">${icon('database')} ${num(records.length)}-record subset</span></header>
          <div class="analytics-toolbar">
            <label class="analytics-filter"><span>Platform</span><select id="analytics-platform">${filterOptions(allPlatforms, platformFilter, 'All platforms')}</select></label>
            <label class="analytics-filter"><span>Status</span><select id="analytics-status">${filterOptions(allStatuses, statusFilter, 'All statuses')}</select></label>
            <button type="button" class="button button-ghost analytics-clear" data-analytics-action="clear"${platformFilter || statusFilter ? '' : ' hidden'}>${icon('x')} Clear filters</button>
            <div class="analytics-view" role="group" aria-label="Analytics display"><button type="button" data-analytics-view="charts" aria-pressed="${view === 'charts'}">${icon('chart-no-axes-combined')} Charts</button><button type="button" data-analytics-view="table" aria-pressed="${view === 'table'}">${icon('table-2')} Data table</button></div>
          </div>
          <div class="analytics-result" aria-live="polite"></div>
          <div class="analytics-body"></div>
          <footer class="analytics-footnote">${icon('info')} These distributions describe the latest ${num(records.length)} exported records, not all ${num(db.totalCount ?? records.length)} ideas or the full history.</footer>
        </section>`;
        renderData();
      }

      function areaChart(data) {
        const values = data.updates;
        const known = data.rows.length - data.missingUpdated;
        if (!values.length || !known) return '<div class="analytics-chart-missing">No valid update dates are recorded for these ideas.</div>';
        const width = 620, height = 258, left = 39, right = 25, top = 28, bottom = 37;
        const plotWidth = width - left - right, plotHeight = height - top - bottom;
        const high = Math.max(1, ...values.map(item => item.value));
        const ceiling = high <= 4 ? 4 : Math.ceil(high / 4) * 4;
        const x = index => values.length === 1 ? left + plotWidth / 2 : left + index * plotWidth / (values.length - 1);
        const y = value => top + plotHeight - value / ceiling * plotHeight;
        const points = values.map((item, index) => `${x(index)},${y(item.value)}`);
        const line = points.map((point, index) => `${index ? 'L' : 'M'}${point}`).join(' ');
        const area = `${line} L${x(values.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
        const labelInterval = Math.max(1, Math.ceil(values.length / 7));
        const summary = values.map(item => `${labelDate(item.label)}: ${item.value}`).join('; ');
        return `<div class="analytics-area-plot"><svg class="analytics-area-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${esc(`Records by latest update date, India Standard Time. ${summary}`)}"><title>Records by latest update date</title><desc>${esc(summary)}. Each included record is counted once using its latest update timestamp.</desc>
          ${Array.from({ length: 5 }, (_, index) => {
            const value = index * ceiling / 4;
            return `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}" class="analytics-gridline"/>`;
          }).join('')}
          <path d="${area}" class="analytics-area"/><path d="${line}" class="analytics-line"/>
          ${values.map((item, index) => `<circle cx="${x(index)}" cy="${y(item.value)}" r="4" class="analytics-point"><title>${esc(labelDate(item.label))}: ${item.value} records</title></circle>`).join('')}
        </svg><div class="analytics-plot-labels" aria-hidden="true">${Array.from({ length: 5 }, (_, index) => { const value = index * ceiling / 4; return `<span class="analytics-y-label" style="left:${(left - 11) / width * 100}%;top:${y(value) / height * 100}%">${value}</span>`; }).join('')}${values.map((item, index) => `<span class="analytics-value-label" style="left:${x(index) / width * 100}%;top:${y(item.value) / height * 100}%">${item.value}</span>${index % labelInterval === 0 || index === values.length - 1 ? `<span class="analytics-x-label" style="left:${x(index) / width * 100}%">${esc(labelDate(item.label))}</span>` : ''}`).join('')}</div></div>`;
      }

      function donut(data) {
        const radius = 66, circumference = Math.PI * radius * 2;
        let offset = 0;
        const segments = data.tier.map((item, index) => {
          const length = item.value / data.rows.length * circumference;
          const markup = `<circle cx="92" cy="92" r="${radius}" fill="none" stroke="${color(index)}" stroke-width="23" stroke-dasharray="${Math.max(0, length - (data.tier.length > 1 ? 3 : 0))} ${circumference}" stroke-dashoffset="${-offset}" transform="rotate(-90 92 92)"><title>${esc(item.label)}: ${item.value} (${percentage(item.value, data.rows.length)})</title></circle>`;
          offset += length;
          return markup;
        }).join('');
        return `<div class="analytics-donut-wrap"><svg class="analytics-donut" viewBox="0 0 184 184" role="img" aria-label="${esc('Idea tier distribution. ' + data.tier.map(item => `${item.label}: ${item.value}`).join('; '))}">${segments}<text x="92" y="91" text-anchor="middle" class="analytics-donut-total">${data.rows.length}</text><text x="92" y="111" text-anchor="middle" class="analytics-donut-caption">ideas shown</text></svg></div><ul class="analytics-legend">${data.tier.map((item, index) => `<li><span class="analytics-swatch" style="background:${color(index)}" aria-hidden="true"></span><span>${esc(item.label)}</span><strong>${num(item.value)}</strong><span class="analytics-percent">${percentage(item.value, data.rows.length)}</span></li>`).join('')}</ul>`;
      }

      function statusBars(data) {
        return `<div class="analytics-status-bars" role="img" aria-label="${esc('Status distribution. ' + data.status.map(item => `${item.label}: ${item.value} of ${data.rows.length}`).join('; '))}">${data.status.map(item => `<div class="analytics-status-row"><div class="analytics-bar-label"><span>${esc(item.label)}</span><span><strong>${num(item.value)}</strong><small>${percentage(item.value, data.rows.length)}</small></span></div><div class="analytics-bar-track"><span style="width:${item.value / data.rows.length * 100}%"></span></div></div>`).join('')}</div>`;
      }

      function platformBars(data) {
        const max = Math.max(1, ...data.platforms.map(item => item.value));
        return `<div class="analytics-platform-bars" role="img" aria-label="${esc('Platform coverage. ' + data.platforms.map(item => `${item.label}: ${item.value} ideas`).join('; '))}">${data.platforms.map((item, index) => `<div class="analytics-platform-column"><span class="analytics-platform-name">${esc(item.label)}</span><div class="analytics-column-area"><span class="analytics-column-fill" style="width:${item.value / max * 100}%;background:${color(index)}"></span></div><strong>${num(item.value)}</strong></div>`).join('')}</div>`;
      }

      function charts(data) {
        const platformAssignments = data.platforms.reduce((sum, item) => sum + item.value, 0);
        const range = data.updates.length ? `${labelDate(data.updates[0].label)}–${labelDate(data.updates[data.updates.length - 1].label)} ${data.updates[0].label.slice(0, 4)}` : 'No dates recorded';
        return `<div class="analytics-grid">
          <section class="analytics-panel analytics-dates snapshot-reveal" aria-labelledby="analytics-date-title"><div class="analytics-panel-heading"><div><h3 id="analytics-date-title">Records by latest update date</h3><p>${esc(range)} · India Standard Time</p></div><span class="analytics-panel-badge">${num(data.rows.length - data.missingUpdated)} dated records</span></div>${areaChart(data)}<p class="analytics-chart-note">Each idea appears on its most recent update date. This is a snapshot distribution, not an activity timeline.${data.missingUpdated ? ` ${num(data.missingUpdated)} missing update dates are excluded.` : ''}</p><p class="analytics-date-missing">Date added: ${num(data.missingAdded)} of ${num(data.rows.length)} not set. Creation dates are not inferred.</p></section>
          <section class="analytics-panel analytics-tiers snapshot-reveal" aria-labelledby="analytics-tier-title"><div class="analytics-panel-heading"><div><h3 id="analytics-tier-title">Idea tiers</h3><p>Share of ${num(data.rows.length)} ideas shown</p></div></div>${donut(data)}</section>
          <section class="analytics-panel analytics-statuses snapshot-reveal" aria-labelledby="analytics-status-title"><div class="analytics-panel-heading"><div><h3 id="analytics-status-title">Where the ideas stand</h3><p>Exact recorded statuses · ${num(data.rows.length)} ideas</p></div><span class="analytics-panel-badge">${num(data.status.length)} statuses</span></div>${statusBars(data)}</section>
          <section class="analytics-panel analytics-platforms snapshot-reveal" aria-labelledby="analytics-platform-title"><div class="analytics-panel-heading"><div><h3 id="analytics-platform-title">Platform coverage</h3><p>${num(platformAssignments)} selections across ${num(data.rows.length)} ideas</p></div></div>${platformBars(data)}<p class="analytics-chart-note">An idea can select several platforms, so these counts can add up to more than ${num(data.rows.length)}.</p></section>
        </div>`;
      }

      function chartTable(titleText, labelText, values, denominator, dateLabels) {
        return `<section class="analytics-data-group snapshot-reveal"><h3>${esc(titleText)}</h3><table><caption class="analytics-sr-only">${esc(titleText)}, based on ${denominator} matching records</caption><thead><tr><th scope="col">${esc(labelText)}</th><th scope="col">Records</th><th scope="col">Share</th></tr></thead><tbody>${values.map(item => `<tr><th scope="row">${esc(dateLabels ? labelDate(item.label) + ' ' + item.label.slice(0, 4) : item.label)}</th><td>${num(item.value)}</td><td>${percentage(item.value, denominator)}</td></tr>`).join('')}</tbody></table></section>`;
      }

      function tables(data) {
        return `<p class="analytics-table-context">Shares use ${num(data.rows.length)} matching ideas as the denominator. Platform shares may total more than 100% because the field allows multiple selections.</p><div class="analytics-data-grid">${chartTable('Records by latest update date · IST', 'Date', data.updates, data.rows.length, true)}${chartTable('Idea tiers', 'Tier', data.tier, data.rows.length, false)}${chartTable('Recorded statuses', 'Status', data.status, data.rows.length, false)}${chartTable('Platform coverage', 'Platform', data.platforms, data.rows.length, false)}</div>`;
      }

      function sourceRecords(data) {
        return `<details class="analytics-source-records"><summary>${icon('list')} View ${num(data.rows.length)} source records<span>${icon('chevron-down')}</span></summary><div class="analytics-record-list">${data.rows.map(record => `<button type="button" data-analytics-record="${records.indexOf(record)}"><span>${esc(title(record))}</span><span>${esc(field(record, 'status'))}${icon('arrow-up-right')}</span></button>`).join('')}</div></details>`;
      }

      function renderData() {
        if (destroyed) return;
        const rows = selected();
        const data = aggregate(rows);
        const result = root.querySelector('.analytics-result');
        result.innerHTML = `<span><strong>${num(rows.length)}</strong> of ${num(records.length)} included ideas shown</span><span><strong>${num(data.status.find(item => item.label === 'Waiting for approval')?.value || 0)}</strong> Waiting for approval</span><span><strong>${num(data.platforms.length)}</strong> platforms represented</span>`;
        root.querySelectorAll('[data-analytics-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.analyticsView === view)));
        root.querySelector('[data-analytics-action="clear"]').hidden = !platformFilter && !statusFilter;
        root.querySelector('.analytics-body').innerHTML = rows.length ? `${view === 'charts' ? charts(data) : tables(data)}${sourceRecords(data)}` : `<div class="analytics-empty">${icon('filter')}<h3>${records.length ? 'No ideas match both filters' : 'No content records in this export'}</h3><p>${records.length ? 'Choose another platform or status to explore the included ideas.' : 'Charts will appear when a source snapshot includes records.'}</p>${records.length ? '<button type="button" class="button" data-analytics-action="clear">Clear filters</button>' : ''}</div>`;
        api.status(`Content analytics: ${num(rows.length)} of ${num(records.length)} included records. Charts reflect this subset only.`);
      }

      function clearFilters() {
        platformFilter = '';
        statusFilter = '';
        root.querySelector('#analytics-platform').value = '';
        root.querySelector('#analytics-status').value = '';
        renderData();
        root.querySelector('#analytics-platform').focus({ preventScroll: true });
      }
      function handleChange(event) {
        if (event.target.id === 'analytics-platform') { platformFilter = event.target.value; renderData(); }
        if (event.target.id === 'analytics-status') { statusFilter = event.target.value; renderData(); }
      }
      function handleClick(event) {
        const viewButton = event.target.closest('[data-analytics-view]');
        if (viewButton && root.contains(viewButton)) { view = viewButton.dataset.analyticsView; renderData(); return; }
        const clearButton = event.target.closest('[data-analytics-action="clear"]');
        if (clearButton && root.contains(clearButton)) { clearFilters(); return; }
        const recordButton = event.target.closest('[data-analytics-record]');
        if (recordButton && root.contains(recordButton)) {
          const record = records[Number(recordButton.dataset.analyticsRecord)];
          if (record) api.openRecord(record, title(record));
        }
      }
      root.addEventListener('click', handleClick);
      root.addEventListener('change', handleChange);
      renderShell();
      return {
        reset() { platformFilter = ''; statusFilter = ''; view = 'charts'; renderShell(); },
        destroy() { destroyed = true; root.removeEventListener('click', handleClick); root.removeEventListener('change', handleChange); },
      };
    },
  };
})();
