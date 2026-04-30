// features.js — myforestconnect additive features v2
// Fast hover tooltip, What-if impact analyser, Downloadable report cards.
//
// HOW TO USE:
//   Add ONE line before <script src="config.js"> in each map HTML file:
//       <script src="features.js"></script>
//   Remove that line to revert completely. Nothing else needs to change.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
    'use strict';

    // ── Load dependencies ─────────────────────────────────────────────────────
    function loadScript(src, cb) {
        var s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = cb; s.onerror = cb;
        document.head.appendChild(s);
    }
    function loadCSS(href) {
        var l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = href;
        document.head.appendChild(l);
    }

    loadCSS('https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.4.3/mapbox-gl-draw.css');
    loadScript('https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.4.3/mapbox-gl-draw.js', function () {
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/Turf.js/6.5.0/turf.min.js', onDepsReady);
    });

    // ── Intercept mapboxgl.Map ────────────────────────────────────────────────
    var _OrigMap = mapboxgl.Map;
    mapboxgl.Map = class extends _OrigMap {
        constructor(options) {
            super(options);
            window._mapInstance = this;
            var self = this;

            // Capture last clicked patch + coordinates
            this.on('click', function (e) {
                try {
                    var style = self.getStyle();
                    if (!style) return;
                    var pl = (style.layers || []).find(function (l) {
                        return l.type === 'fill' && (
                            l.id.toLowerCase().includes('forest') ||
                            l.id.toLowerCase().includes('patch') ||
                            l.id.toLowerCase().includes('klang') ||
                            l.id.toLowerCase().includes('kuantan')
                        );
                    });
                    if (!pl) return;
                    var feats = self.queryRenderedFeatures(e.point, { layers: [pl.id] });
                    if (feats && feats.length) {
                        window._lastPatchProps  = feats[0].properties;
                        window._lastPatchLngLat = e.lngLat;
                    }
                } catch (ex) {}
            });

            this.on('load', function () {
                if (window._depsReady) initFeatures(self);
                else window._pendingMap = self;
            });
        }
    };

    function onDepsReady() {
        window._depsReady = true;
        var map = window._pendingMap || window._mapInstance;
        if (map) { initFeatures(map); window._pendingMap = null; }
    }

    function initFeatures(map) {
        initFastTooltip(map);
        initWhatIf(map);
        initReportCards();
    }

    // ── Tier display name ─────────────────────────────────────────────────────
    function displayName(tierInternal) {
        var DISP = window.TIER_DISPLAY_NAMES || {};
        return DISP[tierInternal] || tierInternal || 'Unknown';
    }

    // ── Tier conservation weight ──────────────────────────────────────────────
    var TIER_WEIGHT = {
        'Tier 1 (Core Habitat)':              100,
        'Tier 2 (Major Stepping Stones)':      70,
        'Tier 3 (Connected Fragments)':        45,
        'Tier 4 (Vulnerable Edge Fragments)':  25,
        'Tier 5 (Isolated Fragments)':         10,
        'Tier 6 (Isolated Micro Patches)':      3
    };

    // ── Resolve patch layer ───────────────────────────────────────────────────
    function getPatchLayer(map) {
        try {
            var found = (map.getStyle().layers || []).find(function (l) {
                return l.type === 'fill' && (
                    l.id.toLowerCase().includes('forest') ||
                    l.id.toLowerCase().includes('patch') ||
                    l.id.toLowerCase().includes('klang') ||
                    l.id.toLowerCase().includes('kuantan')
                );
            });
            return found ? found.id : null;
        } catch (e) { return null; }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 1. FAST HOVER TOOLTIP — suppressed while drawing
    // ════════════════════════════════════════════════════════════════════════════
    var _drawActive = false;

    function initFastTooltip(map) {
        var tip = document.createElement('div');
        tip.id = 'fast-tooltip';
        tip.style.cssText = 'position:fixed;pointer-events:none;display:none;z-index:500;' +
            'background:rgba(15,30,15,0.93);color:#dcedc8;padding:7px 11px;border-radius:5px;' +
            'font-size:12px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
            'box-shadow:0 3px 12px rgba(0,0,0,0.35);max-width:240px;border-left:3px solid #52b788;line-height:1.5;';
        document.body.appendChild(tip);

        var CC = { High:'#52b788', Moderate:'#f7ce46', Low:'#e07c1f', Barrier:'#6b3fa0', 'No Data':'#888' };
        var patchLayerId = null;

        map.getCanvas().addEventListener('mousemove', function (e) {
            if (_drawActive) { tip.style.display = 'none'; return; }
            if (!patchLayerId) patchLayerId = getPatchLayer(map);
            if (!patchLayerId) { tip.style.display = 'none'; return; }

            var rect = map.getCanvas().getBoundingClientRect();
            var pt   = [e.clientX - rect.left, e.clientY - rect.top];
            var feats = [];
            try { feats = map.queryRenderedFeatures(pt, { layers: [patchLayerId] }); } catch (ex) {}

            if (!feats.length) { tip.style.display = 'none'; return; }

            var p    = feats[0].properties;
            var tier = displayName(p.Tier);
            var conn = p.connectivity || '';
            var area = p.area != null ? parseFloat(p.area).toFixed(1) + ' ha' : '';
            var cc   = CC[conn] || '#888';
            var ct   = (conn === 'High' || conn === 'Moderate') ? '#1a1a1a' : '#fff';

            tip.innerHTML =
                '<div style="font-weight:700;margin-bottom:3px;color:#c8e6c9">' + tier + '</div>' +
                (conn ? '<div style="margin-bottom:2px"><span style="display:inline-block;padding:1px 7px;border-radius:3px;background:' + cc + ';color:' + ct + ';font-size:11px;font-weight:700">' + conn + '</span></div>' : '') +
                (area ? '<div style="font-size:11px;opacity:0.75;margin-top:2px">' + area + '</div>' : '') +
                '<div style="font-size:10px;opacity:0.55;margin-top:3px;font-style:italic">Click for full details</div>';

            tip.style.display = 'block';
            tip.style.left    = (e.clientX + 16) + 'px';
            tip.style.top     = (e.clientY - 10) + 'px';
        });

        map.getCanvas().addEventListener('mouseleave', function () { tip.style.display = 'none'; });
        map.on('style.load', function () { patchLayerId = null; });
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 2. WHAT-IF IMPACT ANALYSER
    // ════════════════════════════════════════════════════════════════════════════
    function initWhatIf(map) {
        if (typeof MapboxDraw === 'undefined' || typeof turf === 'undefined') {
            console.warn('features.js: MapboxDraw or Turf not ready'); return;
        }

        var draw = new MapboxDraw({
            displayControlsDefault: false,
            controls: { polygon: true, trash: true },
            styles: [
                { id:'gl-draw-polygon-fill', type:'fill',
                  filter:['all',['==','$type','Polygon']],
                  paint:{'fill-color':'#e07c1f','fill-opacity':0.12} },
                { id:'gl-draw-polygon-stroke', type:'line',
                  filter:['all',['==','$type','Polygon']],
                  paint:{'line-color':'#e07c1f','line-width':2,'line-dasharray':[4,2]} },
                { id:'gl-draw-polygon-fill-active', type:'fill',
                  filter:['all',['==','$type','Polygon'],['==','active','true']],
                  paint:{'fill-color':'#e07c1f','fill-opacity':0.2} },
                { id:'gl-draw-vertex', type:'circle',
                  filter:['all',['==','$type','Point']],
                  paint:{'circle-radius':5,'circle-color':'#e07c1f'} }
            ]
        });
        map.addControl(draw, 'top-right');

        var topBar = document.getElementById('map-top-bar');
        if (!topBar) return;

        var btn = document.createElement('button');
        btn.id        = 'whatif-btn';
        btn.innerHTML = '&#x2295;&nbsp;Impact analyser';
        btn.title     = 'Draw a zone to calculate its conservation impact';
        btn.style.cssText = 'background:#e07c1f;color:white;border:none;border-radius:5px;' +
            'padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;' +
            'font-family:inherit;letter-spacing:0.02em;transition:background 0.15s;';
        btn.addEventListener('mouseover', function () { if (!btn.classList.contains('active')) btn.style.background = '#b85f10'; });
        btn.addEventListener('mouseout',  function () { if (!btn.classList.contains('active')) btn.style.background = '#e07c1f'; });
        topBar.appendChild(btn);

        var panel = document.createElement('div');
        panel.id = 'whatif-panel';
        panel.style.cssText = 'display:none;position:absolute;bottom:40px;right:12px;z-index:20;' +
            'background:rgba(255,255,255,0.97);border-radius:10px;padding:16px 18px;' +
            'width:300px;box-shadow:0 6px 24px rgba(0,0,0,0.18);' +
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
            'font-size:13px;color:#212529;max-height:420px;overflow-y:auto;';
        document.getElementById('map-container').appendChild(panel);

        btn.addEventListener('click', function () {
            _drawActive = !_drawActive;
            if (_drawActive) {
                btn.innerHTML = '&#x2715;&nbsp;Exit analyser';
                btn.style.background = '#b85f10';
                btn.classList.add('active');
                panel.style.display = 'none';
                draw.changeMode('draw_polygon');
                showHint();
            } else {
                exitAnalyser();
            }
        });

        function exitAnalyser() {
            _drawActive = false;
            btn.innerHTML = '&#x2295;&nbsp;Impact analyser';
            btn.style.background = '#e07c1f';
            btn.classList.remove('active');
            panel.style.display = 'none';
            draw.deleteAll();
            clearHL();
            removeHint();
        }

        function showHint() {
            removeHint();
            var h = document.createElement('div');
            h.id = 'whatif-hint';
            h.style.cssText = 'position:absolute;top:60px;left:50%;transform:translateX(-50%);' +
                'background:rgba(224,124,31,0.95);color:white;padding:8px 18px;' +
                'border-radius:5px;font-size:12px;font-weight:600;z-index:100;' +
                'font-family:inherit;pointer-events:none;white-space:nowrap;' +
                'box-shadow:0 2px 8px rgba(0,0,0,0.2);';
            h.textContent = 'Draw a development zone — double-click to finish';
            document.getElementById('map-container').appendChild(h);
        }
        function removeHint() { var h = document.getElementById('whatif-hint'); if (h) h.remove(); }

        function scoreColor(s) {
            if (s < 20) return '#2d6a4f';
            if (s < 40) return '#52b788';
            if (s < 60) return '#f7ce46';
            if (s < 80) return '#e07c1f';
            return '#c0392b';
        }
        function scoreLabel(s) {
            if (s < 20) return 'Very low';
            if (s < 40) return 'Low';
            if (s < 60) return 'Moderate';
            if (s < 80) return 'High';
            return 'Critical';
        }

        function statCard(label, value, unit) {
            return '<div style="background:#f8f9fa;border-radius:6px;padding:8px 6px;text-align:center">' +
                '<div style="font-size:18px;font-weight:700;color:#1a3d1a">' + value + '</div>' +
                '<div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:0.04em;line-height:1.3">' +
                label + (unit ? ' (' + unit + ')' : '') + '</div></div>';
        }

        function analyse() {
            removeHint();
            clearHL();
            var plId = getPatchLayer(map);
            if (!plId) { showMsg('<strong>Zoom in further</strong> to see patches, then try again.'); return; }

            var rendered = [];
            try { rendered = map.queryRenderedFeatures({ layers: [plId] }); } catch (ex) {}
            if (!rendered.length) {
                showMsg('<p style="color:#888;font-style:italic">Zoom in until patches are visible, then redraw.</p>');
                return;
            }

            var all  = draw.getAll();
            var poly = all.features && all.features[0];
            if (!poly) return;

            var seen = new Set(); var features = [];
            rendered.forEach(function (f) {
                var id = f.properties.id != null ? f.properties.id : f.id;
                if (!seen.has(id)) { seen.add(id); features.push(f); }
            });

            var baselineScore = 0;
            features.forEach(function (f) { baselineScore += (TIER_WEIGHT[f.properties.Tier] || 1); });

            var affected = features.filter(function (f) {
                try { return turf.booleanIntersects(f, poly); } catch (ex) { return false; }
            });

            var impactScore = 0, totalArea = 0, totalCore = 0;
            var tierCounts  = {};
            affected.forEach(function (f) {
                var p = f.properties;
                impactScore += (TIER_WEIGHT[p.Tier] || 1);
                if (p.area) totalArea += parseFloat(p.area) || 0;
                if (p.core) totalCore += parseFloat(p.core) || 0;
                var name = displayName(p.Tier);
                tierCounts[name] = (tierCounts[name] || 0) + 1;
            });

            var normScore = baselineScore > 0
                ? Math.min(100, Math.round((impactScore / baselineScore) * 100 * 3)) : 0;

            var corridors = 0;
            ['connector-solid','connector-glow'].forEach(function (id) {
                if (!map.getLayer(id)) return;
                var fc = []; var seenC = new Set();
                try { fc = map.queryRenderedFeatures({ layers: [id] }); } catch (ex) {}
                fc.forEach(function (f) {
                    var cid = f.id || JSON.stringify(f.properties);
                    if (seenC.has(cid)) return;
                    try { if (turf.booleanIntersects(f, poly)) { seenC.add(cid); corridors++; } } catch (ex) {}
                });
            });

            var zoneArea = 0;
            try { zoneArea = turf.area(poly) / 10000; } catch (ex) {}

            // Highlight
            var affIds = affected.map(function (f) { return f.properties.id != null ? f.properties.id : f.id; });
            try {
                var style  = map.getStyle();
                var pLayer = (style.layers || []).find(function (l) { return l.id === plId; });
                if (pLayer) {
                    map.addLayer({ id:'whatif-hl', type:'fill',
                        source: pLayer.source, 'source-layer': pLayer['source-layer'],
                        filter: ['in',['get','id'],['literal', affIds]],
                        paint: {'fill-color':'#e07c1f','fill-opacity':0.35}, slot:'top' });
                    map.addLayer({ id:'whatif-hl-stroke', type:'line',
                        source: pLayer.source, 'source-layer': pLayer['source-layer'],
                        filter: ['in',['get','id'],['literal', affIds]],
                        paint: {'line-color':'#e07c1f','line-width':2}, slot:'top' });
                }
            } catch (e) { console.warn('HL:', e.message); }

            if (!affected.length) {
                showMsg('<div style="font-weight:700;margin-bottom:6px;color:#1a3d1a">Conservation impact</div>' +
                    '<p style="color:#555;font-size:12px">No patches intersect this zone at the current zoom level.</p>');
                return;
            }

            var sc = scoreColor(normScore);
            var sl = scoreLabel(normScore);

            var tierRows = Object.entries(tierCounts)
                .sort(function (a,b) { return a[0].localeCompare(b[0]); })
                .map(function (entry) {
                    return '<div style="display:flex;justify-content:space-between;padding:3px 0;' +
                        'border-bottom:1px solid #f0f0f0;font-size:12px">' +
                        '<span style="color:#555">' + entry[0] + '</span>' +
                        '<strong style="color:#1a3d1a">' + entry[1] + '</strong></div>';
                }).join('');

            panel.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
                '<strong style="color:#1a3d1a;font-size:14px">Conservation impact</strong>' +
                '<span style="font-size:11px;color:#aaa;cursor:pointer;padding:2px 6px" ' +
                'onclick="document.getElementById(\'whatif-panel\').style.display=\'none\'">✕</span></div>' +

                '<div style="margin-bottom:14px">' +
                '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
                '<span style="font-size:11px;color:#666;font-weight:600">IMPACT SCORE</span>' +
                '<span style="font-size:13px;font-weight:700;color:' + sc + '">' + normScore + ' / 100 — ' + sl + '</span></div>' +
                '<div style="background:#e9ecef;border-radius:4px;height:10px;overflow:hidden">' +
                '<div style="width:' + normScore + '%;height:100%;background:' + sc + ';border-radius:4px;transition:width 0.6s ease"></div></div>' +
                '<div style="font-size:10px;color:#aaa;margin-top:3px;font-style:italic">Weighted by tier conservation value relative to visible landscape</div></div>' +

                '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:14px">' +
                statCard('Patches', affected.length, '') +
                statCard('Core area lost', totalCore.toFixed(1), 'ha') +
                statCard('Corridors severed', corridors, '') +
                '</div>' +

                '<div style="font-size:11px;color:#666;margin-bottom:10px">Zone drawn: <strong>' + zoneArea.toFixed(1) + ' ha</strong></div>' +

                '<div style="font-size:11px;font-weight:600;color:#666;margin-bottom:6px">BREAKDOWN BY TIER</div>' +
                tierRows +

                '<div style="margin-top:10px;font-size:10px;color:#bbb;font-style:italic">Based on currently visible patches. Zoom in for complete results.</div>';

            panel.style.display = 'block';
        }

        function showMsg(html) { panel.innerHTML = html; panel.style.display = 'block'; }

        function clearHL() {
            try { if (map.getLayer('whatif-hl'))        map.removeLayer('whatif-hl'); }        catch (ex) {}
            try { if (map.getLayer('whatif-hl-stroke')) map.removeLayer('whatif-hl-stroke'); } catch (ex) {}
        }

        map.on('draw.create', analyse);
        map.on('draw.update', analyse);
        map.on('draw.delete', function () { clearHL(); panel.style.display = 'none'; });
        map.on('style.load',  clearHL);
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 3. REPORT CARDS — 2× resolution, coordinates, cleaner layout
    // ════════════════════════════════════════════════════════════════════════════
    function initReportCards() {
        var observer = new MutationObserver(function () {
            var content = document.getElementById('patch-info-content');
            if (!content) return;
            if (document.getElementById('report-card-btn')) return;
            if (!window._lastPatchProps) return;
            var txt = content.textContent.trim();
            if (!txt || txt === 'Select a patch on the map.' || txt === 'No data for this patch.') return;

            var btn = document.createElement('button');
            btn.id = 'report-card-btn';
            btn.textContent = '⬇ Download report card';
            btn.style.cssText = 'display:block;width:100%;margin-top:10px;padding:8px 10px;' +
                'background:#2a8234;color:white;border:none;border-radius:4px;' +
                'font-size:12px;font-weight:600;cursor:pointer;' +
                'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;transition:background 0.15s;';
            btn.addEventListener('mouseover', function () { btn.style.background = '#1e6b27'; });
            btn.addEventListener('mouseout',  function () { btn.style.background = '#2a8234'; });
            btn.addEventListener('click', function () {
                generateCard(window._lastPatchProps, window._lastPatchLngLat);
            });
            content.appendChild(btn);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function generateCard(p, lngLat) {
        if (!p) return;

        var TC = window.TIER_COLORS || {};
        var CC = { High:'#52b788', Moderate:'#f7ce46', Low:'#e07c1f', Barrier:'#6b3fa0', 'No Data':'#aaa' };

        var tierLabel = displayName(p.Tier);
        var tierColor = TC[p.Tier] || '#2a8234';
        var conn      = p.connectivity || 'No Data';
        var connColor = CC[conn] || '#aaa';
        var connText  = (conn === 'High' || conn === 'Moderate') ? '#1a1a1a' : '#ffffff';
        var lat = lngLat ? lngLat.lat.toFixed(5) : null;
        var lng = lngLat ? lngLat.lng.toFixed(5) : null;

        var W = 720, H = 460, SC = 2;
        var canvas = document.createElement('canvas');
        canvas.width  = W * SC;
        canvas.height = H * SC;
        var ctx = canvas.getContext('2d');
        ctx.scale(SC, SC);

        var F = 'Arial, sans-serif';

        // Background
        ctx.fillStyle = '#f5f3ee'; ctx.fillRect(0, 0, W, H);
        // Left stripe
        ctx.fillStyle = tierColor; ctx.fillRect(0, 0, 7, H);
        // Header
        ctx.fillStyle = '#1a3d1a'; ctx.fillRect(7, 0, W - 7, 80);
        // Dot texture in header
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (var xi = 20; xi < W; xi += 18)
            for (var yi = 6; yi < 80; yi += 18)
                circ(ctx, xi, yi, 2);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 19px ' + F;
        ctx.fillText('Forest Patch Report Card', 24, 30);
        ctx.font = '13px ' + F;
        ctx.fillStyle = '#a5d6a7';
        ctx.fillText('myforestconnect.online', 24, 52);

        if (p.id != null) {
            var idTxt = 'Patch #' + p.id;
            ctx.font = 'bold 12px ' + F;
            ctx.fillStyle = '#c8e6c9';
            ctx.fillText(idTxt, W - ctx.measureText(idTxt).width - 18, 30);
        }

        // Tier badge
        ctx.fillStyle = tierColor;
        rrect(ctx, 24, 96, 310, 42, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        rrect(ctx, 25, 97, 308, 20, 5); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px ' + F;
        ctx.fillText(tierLabel, 38, 122);

        // Connectivity badge
        ctx.fillStyle = connColor;
        rrect(ctx, 346, 96, 155, 42, 6); ctx.fill();
        ctx.fillStyle = connText;
        ctx.font = '11px ' + F; ctx.fillText('Connectivity', 360, 113);
        ctx.font = 'bold 15px ' + F; ctx.fillText(conn, 360, 130);

        // Coordinates badge
        if (lat && lng) {
            ctx.fillStyle = '#2d6a4f';
            rrect(ctx, 513, 96, 183, 42, 6); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = '11px ' + F; ctx.fillText('Location', 527, 113);
            ctx.font = 'bold 12px ' + F;
            ctx.fillText(lat + '\u00b0N,  ' + lng + '\u00b0E', 527, 130);
        }

        // Divider + section label
        ctx.strokeStyle = '#e0dbd0'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(24, 153); ctx.lineTo(W - 18, 153); ctx.stroke();
        ctx.fillStyle = '#999'; ctx.font = 'bold 10px ' + F;
        ctx.fillText('STRUCTURAL METRICS', 24, 170);

        // Metric cards (2 rows × 3)
        var nv = function (v) { return v != null ? parseFloat(v) : null; };
        var metrics = [
            { label:'Total area',       value: nv(p.area)      != null ? nv(p.area).toFixed(2)       : '\u2014', unit:'ha' },
            { label:'Core area',        value: nv(p.core)      != null ? nv(p.core).toFixed(2)       : '\u2014', unit:'ha' },
            { label:'Contiguity',       value: nv(p.contig)    != null ? nv(p.contig).toFixed(3)     : '\u2014', unit:'0\u20131' },
            { label:'ENN distance',     value: nv(p.enn)       != null ? Math.round(nv(p.enn)) + ''  : '\u2014', unit:'m' },
            { label:'Perim-area ratio', value: nv(p.para)      != null ? nv(p.para).toFixed(5)       : '\u2014', unit:'' },
            { label:'Mean flow',        value: nv(p.mean_flow) != null ? nv(p.mean_flow).toFixed(2)  : '\u2014', unit:'' }
        ];

        var cW = (W - 48 - 16) / 3, cH = 80;
        metrics.forEach(function (m, i) {
            var col = i % 3, row = Math.floor(i / 3);
            var x = 24 + col * (cW + 8), y = 180 + row * (cH + 8);
            ctx.fillStyle = 'rgba(0,0,0,0.05)';
            rrect(ctx, x+2, y+2, cW, cH, 6); ctx.fill();
            ctx.fillStyle = '#ffffff';
            rrect(ctx, x, y, cW, cH, 6); ctx.fill();
            ctx.strokeStyle = '#e8e4de'; ctx.lineWidth = 1;
            rrect(ctx, x, y, cW, cH, 6); ctx.stroke();
            ctx.fillStyle = tierColor; ctx.fillRect(x, y, 4, cH);
            ctx.fillStyle = '#999'; ctx.font = '10px ' + F;
            ctx.fillText(m.label.toUpperCase(), x + 12, y + 18);
            ctx.fillStyle = '#1a3d1a'; ctx.font = 'bold 20px ' + F;
            ctx.fillText(m.value, x + 12, y + 50);
            if (m.unit) { ctx.fillStyle = '#bbb'; ctx.font = '11px ' + F; ctx.fillText(m.unit, x + 12, y + 68); }
        });

        // Footer
        ctx.fillStyle = '#1a3d1a'; ctx.fillRect(0, H - 38, W, 38);
        ctx.fillStyle = tierColor;  ctx.fillRect(0, H - 38, 7, 38);
        ctx.fillStyle = '#ffffff'; ctx.font = '11px ' + F;
        var d = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
        ctx.fillText('Generated ' + d, 20, H - 17);
        ctx.fillStyle = '#a5d6a7'; ctx.font = '11px ' + F;
        var site = 'myforestconnect.online';
        ctx.fillText(site, W - ctx.measureText(site).width - 18, H - 17);

        var a = document.createElement('a');
        a.download = 'patch_' + (p.id != null ? p.id : 'report') + '_report_card.png';
        a.href = canvas.toDataURL('image/png', 1.0);
        a.click();
    }

    function rrect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
        ctx.quadraticCurveTo(x+w, y, x+w, y+r);
        ctx.lineTo(x+w, y+h-r);
        ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
        ctx.lineTo(x+r, y+h);
        ctx.quadraticCurveTo(x, y+h, x, y+h-r);
        ctx.lineTo(x, y+r);
        ctx.quadraticCurveTo(x, y, x+r, y);
        ctx.closePath();
    }
    function circ(ctx, x, y, r) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

})();
