// features.js — myforestconnect additive features
// What-if scenario builder, fast hover tooltip, downloadable report cards.
//
// HOW TO USE:
//   In klang-valley-map.html and kuantan-map.html, add ONE line
//   immediately before <script src="config.js">:
//
//       <script src="features.js"></script>
//
// Nothing else needs to change. Remove that line to revert completely.
//
// REQUIRES: Mapbox GL JS (already loaded), MapboxDraw, Turf.js (loaded below)
// ─────────────────────────────────────────────────────────────────────────────

(function () {
    'use strict';

    // ── Load dependencies ─────────────────────────────────────────────────────
    function loadScript(src, cb) {
        const s = document.createElement('script');
        s.src = src; s.onload = cb; s.onerror = cb;
        document.head.appendChild(s);
    }
    function loadCSS(href) {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = href;
        document.head.appendChild(l);
    }

    loadCSS('https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.4.3/mapbox-gl-draw.css');
    loadScript('https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.4.3/mapbox-gl-draw.js', () => {
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/Turf.js/6.5.0/turf.min.js', onDepsReady);
    });

    // ── Intercept mapboxgl.Map to capture the instance ────────────────────────
    // Runs before app.js so we can grab the map when it's constructed.
    const _OrigMap = mapboxgl.Map;
    mapboxgl.Map = class extends _OrigMap {
        constructor(options) {
            super(options);
            window._mapInstance = this;

            // Capture properties of the last clicked patch without modifying app.js
            this.on('click', (e) => {
                try {
                    const style = this.getStyle();
                    if (!style) return;
                    const pl = (style.layers || []).find(l =>
                        l.type === 'fill' && (
                            l.id.toLowerCase().includes('forest') ||
                            l.id.toLowerCase().includes('patch') ||
                            l.id.toLowerCase().includes('klang') ||
                            l.id.toLowerCase().includes('kuantan')
                        )
                    );
                    if (!pl) return;
                    const feats = this.queryRenderedFeatures(e.point, { layers: [pl.id] });
                    if (feats && feats.length) window._lastPatchProps = feats[0].properties;
                } catch(_) {}
            });

            this.on('load', () => {
                if (window._depsReady) initFeatures(this);
                else window._pendingMap = this;
            });
        }
    };

    let _map = null;

    function onDepsReady() {
        window._depsReady = true;
        if (window._pendingMap) {
            initFeatures(window._pendingMap);
            window._pendingMap = null;
        } else if (window._mapInstance && window._mapInstance.loaded()) {
            initFeatures(window._mapInstance);
        }
    }

    function initFeatures(map) {
        _map = map;
        initFastTooltip(map);
        initWhatIf(map);
        initReportCards();
    }

    // ── Helper: resolve patch fill layer id ───────────────────────────────────
    function getPatchLayer(map) {
        try {
            const style = map.getStyle();
            const found = (style.layers || []).find(l =>
                l.type === 'fill' && (
                    l.id.toLowerCase().includes('forest') ||
                    l.id.toLowerCase().includes('patch') ||
                    l.id.toLowerCase().includes('klang') ||
                    l.id.toLowerCase().includes('kuantan')
                )
            );
            return found ? found.id : null;
        } catch(_) { return null; }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 1. FAST HOVER TOOLTIP
    // ════════════════════════════════════════════════════════════════════════════
    function initFastTooltip(map) {
        const tip = document.createElement('div');
        tip.id = 'fast-tooltip';
        tip.style.cssText = [
            'position:fixed;pointer-events:none;display:none;z-index:500;',
            'background:rgba(15,30,15,0.92);color:#dcedc8;',
            'padding:7px 11px;border-radius:5px;font-size:12px;',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
            'box-shadow:0 3px 12px rgba(0,0,0,0.35);max-width:240px;',
            'border-left:3px solid #52b788;line-height:1.5;'
        ].join('');
        document.body.appendChild(tip);

        const CC = {
            High:'#52b788', Moderate:'#f7ce46',
            Low:'#e07c1f', Barrier:'#6b3fa0', 'No Data':'#888'
        };

        let patchLayerId = null;

        map.getCanvas().addEventListener('mousemove', (e) => {
            if (!patchLayerId) patchLayerId = getPatchLayer(map);
            if (!patchLayerId) { tip.style.display = 'none'; return; }

            const rect = map.getCanvas().getBoundingClientRect();
            const pt   = [e.clientX - rect.left, e.clientY - rect.top];
            let feats  = [];
            try { feats = map.queryRenderedFeatures(pt, { layers: [patchLayerId] }); } catch(_) {}

            if (!feats.length) { tip.style.display = 'none'; return; }

            const p    = feats[0].properties;
            const DISP = window.TIER_DISPLAY_NAMES || {};
            const tier = DISP[p.Tier] || p.Tier || 'Forest patch';
            const conn = p.connectivity || '';
            const area = typeof p.area === 'number'
                ? p.area.toFixed(1) + ' ha'
                : (p.area ? parseFloat(p.area).toFixed(1) + ' ha' : '');
            const cc   = CC[conn] || '#888';
            const ct   = (conn === 'High' || conn === 'Moderate') ? '#1a1a1a' : '#fff';

            tip.innerHTML =
                `<div style="font-weight:700;margin-bottom:3px;color:#c8e6c9">${tier}</div>` +
                (conn
                    ? `<div style="margin-bottom:2px"><span style="display:inline-block;padding:1px 7px;` +
                      `border-radius:3px;background:${cc};color:${ct};font-size:11px;font-weight:700">${conn}</span></div>`
                    : '') +
                (area ? `<div style="font-size:11px;opacity:0.75;margin-top:2px">${area}</div>` : '') +
                `<div style="font-size:10px;opacity:0.55;margin-top:3px;font-style:italic">Click for full details</div>`;

            tip.style.display = 'block';
            tip.style.left    = (e.clientX + 16) + 'px';
            tip.style.top     = (e.clientY - 10) + 'px';
        });

        map.getCanvas().addEventListener('mouseleave', () => {
            tip.style.display = 'none';
        });

        // Reset layer id on style change
        map.on('style.load', () => { patchLayerId = null; });
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 2. WHAT-IF SCENARIO BUILDER
    // ════════════════════════════════════════════════════════════════════════════
    function initWhatIf(map) {
        if (typeof MapboxDraw === 'undefined' || typeof turf === 'undefined') {
            console.warn('features.js: MapboxDraw or Turf not ready'); return;
        }

        const draw = new MapboxDraw({
            displayControlsDefault: false,
            controls: { polygon: true, trash: true },
            styles: [
                { id:'gl-draw-polygon-fill', type:'fill',
                  filter:['all',['==','$type','Polygon']],
                  paint:{'fill-color':'#e07c1f','fill-opacity':0.15} },
                { id:'gl-draw-polygon-stroke', type:'line',
                  filter:['all',['==','$type','Polygon']],
                  paint:{'line-color':'#e07c1f','line-width':2,'line-dasharray':[3,2]} },
                { id:'gl-draw-polygon-fill-active', type:'fill',
                  filter:['all',['==','$type','Polygon'],['==','active','true']],
                  paint:{'fill-color':'#e07c1f','fill-opacity':0.2} },
                { id:'gl-draw-vertex', type:'circle',
                  filter:['all',['==','$type','Point']],
                  paint:{'circle-radius':5,'circle-color':'#e07c1f'} }
            ]
        });
        map.addControl(draw, 'top-right');

        // Button in top bar
        const topBar = document.getElementById('map-top-bar');
        if (!topBar) return;

        const btn = document.createElement('button');
        btn.id        = 'whatif-btn';
        btn.innerHTML = '&#x2295;&nbsp;What-if?';
        btn.title     = 'Draw a development zone to see which patches would be affected';
        btn.style.cssText =
            'background:#e07c1f;color:white;border:none;border-radius:5px;' +
            'padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;' +
            'font-family:inherit;letter-spacing:0.02em;transition:background 0.15s;';
        btn.addEventListener('mouseover', () => { if (!btn.classList.contains('active')) btn.style.background = '#b85f10'; });
        btn.addEventListener('mouseout',  () => { if (!btn.classList.contains('active')) btn.style.background = '#e07c1f'; });
        topBar.appendChild(btn);

        // Results panel
        const panel = document.createElement('div');
        panel.id = 'whatif-panel';
        panel.style.cssText =
            'display:none;position:absolute;bottom:40px;right:12px;z-index:20;' +
            'background:rgba(255,255,255,0.97);border-radius:8px;padding:14px 16px;' +
            'max-width:280px;box-shadow:0 4px 20px rgba(0,0,0,0.2);' +
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
            'font-size:13px;color:#212529;max-height:360px;overflow-y:auto;';
        document.getElementById('map-container').appendChild(panel);

        let active = false;

        btn.addEventListener('click', () => {
            active = !active;
            if (active) {
                btn.innerHTML = '&#x2715;&nbsp;Exit what-if';
                btn.style.background = '#b85f10';
                btn.classList.add('active');
                panel.style.display = 'none';
                draw.changeMode('draw_polygon');
                showHint();
            } else {
                exitWhatIf();
            }
        });

        function exitWhatIf() {
            active = false;
            btn.innerHTML = '&#x2295;&nbsp;What-if?';
            btn.style.background = '#e07c1f';
            btn.classList.remove('active');
            panel.style.display = 'none';
            draw.deleteAll();
            clearHL();
            removeHint();
        }

        function showHint() {
            removeHint();
            const h = document.createElement('div');
            h.id = 'whatif-hint';
            h.style.cssText =
                'position:absolute;top:60px;left:50%;transform:translateX(-50%);' +
                'background:rgba(224,124,31,0.95);color:white;padding:8px 16px;' +
                'border-radius:5px;font-size:12px;font-weight:600;z-index:100;' +
                'font-family:inherit;pointer-events:none;white-space:nowrap;';
            h.textContent = 'Click to draw a development zone — double-click to finish';
            document.getElementById('map-container').appendChild(h);
        }
        function removeHint() { const h = document.getElementById('whatif-hint'); if (h) h.remove(); }

        function analyse() {
            removeHint();
            clearHL();
            const plId = getPatchLayer(map);
            if (!plId) {
                panel.innerHTML = '<strong>Zoom in further</strong> to see patches, then try again.';
                panel.style.display = 'block'; return;
            }
            let rendered = [];
            try { rendered = map.queryRenderedFeatures({ layers: [plId] }); } catch(_) {}
            if (!rendered.length) {
                panel.innerHTML = '<p style="color:#888;font-style:italic">Zoom in until patches are visible, then redraw.</p>';
                panel.style.display = 'block'; return;
            }

            const all  = draw.getAll();
            const poly = all.features && all.features[0];
            if (!poly) return;

            const seen = new Set(); const features = [];
            rendered.forEach(f => {
                const id = f.properties.id != null ? f.properties.id : f.id;
                if (!seen.has(id)) { seen.add(id); features.push(f); }
            });

            const affected = features.filter(f => {
                try { return turf.booleanIntersects(f, poly); } catch(_) { return false; }
            });

            const DISP = window.TIER_DISPLAY_NAMES || {};
            const counts = {}; let totalArea = 0, tier1 = 0;
            affected.forEach(f => {
                const p    = f.properties;
                const tier = DISP[p.Tier] || p.Tier || 'Unknown';
                counts[tier] = (counts[tier] || 0) + 1;
                if (p.area) totalArea += parseFloat(p.area) || 0;
                if (p.Tier && p.Tier.includes('Tier 1')) tier1++;
            });

            let corr = 0;
            ['connector-solid','connector-glow'].forEach(id => {
                if (map.getLayer(id)) {
                    let fc = [];
                    try { fc = map.queryRenderedFeatures({ layers: [id] }); } catch(_) {}
                    fc.forEach(f => { try { if (turf.booleanIntersects(f, poly)) corr++; } catch(_) {} });
                }
            });

            // Highlight affected patches
            const affectedIds = affected.map(f => f.properties.id != null ? f.properties.id : f.id);
            try {
                const style  = map.getStyle();
                const pLayer = (style.layers || []).find(l => l.id === plId);
                if (pLayer) {
                    map.addLayer({
                        id: 'whatif-hl', type: 'line',
                        source: pLayer.source, 'source-layer': pLayer['source-layer'],
                        filter: ['in', ['get', 'id'], ['literal', affectedIds]],
                        paint: { 'line-color': '#e07c1f', 'line-width': 2.5, 'line-opacity': 0.9 },
                        slot: 'top'
                    });
                }
            } catch(e) { console.warn('HL layer:', e.message); }

            if (!affected.length) {
                panel.innerHTML =
                    '<div style="font-weight:700;margin-bottom:8px;color:#1a3d1a">What-if analysis</div>' +
                    '<p style="color:#555">No patches found in this zone. Try zooming in further.</p>';
            } else {
                const warn = tier1
                    ? `<div style="background:#f8d7da;border:1px solid #f5c6cb;border-radius:4px;padding:7px 10px;margin-bottom:10px;font-size:12px;color:#721c24">` +
                      `⚠ <strong>${tier1} Primary forest patch${tier1>1?'es':''}</strong> would be directly impacted.</div>`
                    : '';
                const rows = Object.entries(counts)
                    .sort((a,b) => a[0].localeCompare(b[0]))
                    .map(([t,c]) =>
                        `<tr><td style="padding:2px 6px 2px 0;color:#555">${t}</td>` +
                        `<td style="font-weight:700;color:#1a3d1a;text-align:right">${c}</td></tr>`
                    ).join('');

                panel.innerHTML =
                    `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">` +
                    `<strong style="color:#1a3d1a">What-if analysis</strong>` +
                    `<span style="font-size:10px;color:#888;cursor:pointer" onclick="document.getElementById('whatif-panel').style.display='none'">✕</span></div>` +
                    warn +
                    `<div style="margin-bottom:8px"><strong>${affected.length}</strong> patch${affected.length!==1?'es':''} affected` +
                    ` &nbsp;·&nbsp; <strong>${totalArea.toFixed(0)}</strong> ha total</div>` +
                    `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px">${rows}</table>` +
                    (corr > 0
                        ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:6px 10px;font-size:12px;color:#856404">` +
                          `🔗 <strong>${corr}</strong> corridor segment${corr!==1?'s':''} would be severed.</div>`
                        : `<div style="font-size:12px;color:#555">No active corridors pass through this zone.</div>`) +
                    `<div style="margin-top:10px;font-size:10px;color:#999;font-style:italic">Based on currently visible patches. Zoom in for complete results.</div>`;
            }
            panel.style.display = 'block';
        }

        function clearHL() {
            try { if (map.getLayer('whatif-hl')) map.removeLayer('whatif-hl'); } catch(_) {}
        }

        map.on('draw.create', analyse);
        map.on('draw.update', analyse);
        map.on('draw.delete', () => { clearHL(); panel.style.display = 'none'; });
        map.on('style.load',  () => { clearHL(); });
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 3. DOWNLOADABLE REPORT CARDS
    // ════════════════════════════════════════════════════════════════════════════
    function initReportCards() {
        const observer = new MutationObserver(() => {
            const content = document.getElementById('patch-info-content');
            if (!content) return;
            if (document.getElementById('report-card-btn')) return;
            if (!window._lastPatchProps) return;
            const txt = content.textContent.trim();
            if (txt === 'Select a patch on the map.' || txt === 'No data for this patch.') return;

            const btn = document.createElement('button');
            btn.id = 'report-card-btn';
            btn.textContent = '⬇ Download report card';
            btn.style.cssText =
                'display:block;width:100%;margin-top:10px;padding:7px 10px;' +
                'background:#2a8234;color:white;border:none;border-radius:4px;' +
                'font-size:12px;font-weight:600;cursor:pointer;' +
                'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
                'transition:background 0.15s;';
            btn.addEventListener('mouseover', () => btn.style.background = '#1e6b27');
            btn.addEventListener('mouseout',  () => btn.style.background = '#2a8234');
            btn.addEventListener('click', () => generateCard(window._lastPatchProps));
            content.appendChild(btn);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function generateCard(p) {
        if (!p) return;
        const DISP = window.TIER_DISPLAY_NAMES || {};
        const TC   = window.TIER_COLORS || {};
        const CC   = { High:'#52b788', Moderate:'#f7ce46', Low:'#e07c1f', Barrier:'#6b3fa0', 'No Data':'#888' };

        const tierLabel = DISP[p.Tier] || p.Tier || 'Unknown tier';
        const tierColor = TC[p.Tier]   || '#2a8234';
        const conn      = p.connectivity || 'No Data';
        const connColor = CC[conn] || '#888';
        const connText  = (conn === 'High' || conn === 'Moderate') ? '#1a1a1a' : '#ffffff';

        const W = 640, H = 380;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#f5f3ee'; ctx.fillRect(0, 0, W, H);
        // Header
        ctx.fillStyle = '#1a3d1a'; ctx.fillRect(0, 0, W, 72);
        // Left stripe
        ctx.fillStyle = tierColor; ctx.fillRect(0, 0, 8, H);
        // Header text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 17px Arial, sans-serif';
        ctx.fillText('Forest Patch Report Card', 24, 28);
        ctx.font = '12px Arial, sans-serif';
        ctx.fillStyle = '#a5d6a7';
        ctx.fillText('myforestconnect.online', 24, 52);
        if (p.id != null) {
            ctx.fillStyle = '#c8e6c9';
            ctx.font = '11px Arial, sans-serif';
            ctx.fillText('Patch ID: ' + p.id, W - 130, 36);
        }
        // Tier badge
        ctx.fillStyle = tierColor;
        rrect(ctx, 24, 88, 300, 38, 5); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.fillText(tierLabel, 36, 112);
        // Connectivity badge
        ctx.fillStyle = connColor;
        rrect(ctx, 336, 88, 150, 38, 5); ctx.fill();
        ctx.fillStyle = connText;
        ctx.font = 'bold 12px Arial, sans-serif';
        ctx.fillText('Connectivity: ' + conn, 348, 112);

        // Metric cards
        const n = p => p != null ? parseFloat(p) : null;
        const metrics = [
            { label:'Total area',         value: n(p.area)      != null ? n(p.area).toFixed(2) + ' ha' : '—' },
            { label:'Core area',          value: n(p.core)      != null ? n(p.core).toFixed(2) + ' ha' : '—' },
            { label:'Contiguity index',   value: n(p.contig)    != null ? n(p.contig).toFixed(3)        : '—' },
            { label:'ENN distance',       value: n(p.enn)       != null ? Math.round(n(p.enn)) + ' m'  : '—' },
            { label:'Perim-area ratio',   value: n(p.para)      != null ? n(p.para).toFixed(5)          : '—' },
            { label:'Mean flow',          value: n(p.mean_flow) != null ? n(p.mean_flow).toFixed(2)     : '—' },
        ];
        const colW = (W - 48 - 20) / 3;
        metrics.forEach((m, i) => {
            const col = i % 3, row = Math.floor(i / 3);
            const x = 24 + col * (colW + 10), y = 148 + row * 72;
            ctx.fillStyle = '#ffffff';
            rrect(ctx, x, y, colW, 62, 5); ctx.fill();
            ctx.strokeStyle = '#e0dbd0'; ctx.lineWidth = 1;
            rrect(ctx, x, y, colW, 62, 5); ctx.stroke();
            ctx.fillStyle = '#2a8234'; ctx.fillRect(x, y, 4, 62);
            ctx.fillStyle = '#888';
            ctx.font = '10px Arial, sans-serif';
            ctx.fillText(m.label, x + 12, y + 20);
            ctx.fillStyle = '#1a3d1a';
            ctx.font = 'bold 15px Arial, sans-serif';
            ctx.fillText(m.value, x + 12, y + 46);
        });
        // Footer
        ctx.fillStyle = '#2a8234'; ctx.fillRect(0, H - 36, W, 36);
        ctx.fillStyle = '#ffffff';
        ctx.font = '11px Arial, sans-serif';
        const d = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
        ctx.fillText('Generated ' + d + '  ·  myforestconnect.online', 24, H - 14);

        const a = document.createElement('a');
        a.download = 'patch_' + (p.id != null ? p.id : 'report') + '_report_card.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
    }

    function rrect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
        ctx.quadraticCurveTo(x+w,y,x+w,y+r);
        ctx.lineTo(x+w,y+h-r);
        ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
        ctx.lineTo(x+r,y+h);
        ctx.quadraticCurveTo(x,y+h,x,y+h-r);
        ctx.lineTo(x,y+r);
        ctx.quadraticCurveTo(x,y,x+r,y);
        ctx.closePath();
    }

})();
