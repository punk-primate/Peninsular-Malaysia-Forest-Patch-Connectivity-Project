// features.js — myforestconnect enhanced report cards
//
// HOW TO USE:
//   Add ONE line before <script src="config.js"> in each map HTML file:
//       <script src="features.js"></script>
//   Remove that line to revert completely.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
    'use strict';

    // ── Intercept mapboxgl.Map to capture instance + click data ───────────────
    var _OrigMap = mapboxgl.Map;
    mapboxgl.Map = class extends _OrigMap {
        constructor(options) {
            super(options);
            window._mapInstance = this;
            var self = this;
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
                        window._lastPatchProps    = feats[0].properties;
                        window._lastPatchLngLat   = e.lngLat;
                        window._lastPatchGeometry = feats[0].geometry;
                    }
                } catch (ex) {}
            });
        }
    };

    // ── Inject report card button whenever sidebar populates ──────────────────
    function initReportCards() {
        var observer = new MutationObserver(function () {
            var content = document.getElementById('patch-info-content');
            if (!content) return;
            if (document.getElementById('report-card-btn')) return;
            if (!window._lastPatchProps) return;
            var txt = content.textContent.trim();
            if (!txt ||
                txt === 'Select a patch on the map.' ||
                txt === 'No data for this patch.') return;

            var btn = document.createElement('button');
            btn.id = 'report-card-btn';
            btn.textContent = '⬇ Download report card';
            btn.style.cssText =
                'display:block;width:100%;margin-top:10px;padding:8px 10px;' +
                'background:#2a8234;color:white;border:none;border-radius:4px;' +
                'font-size:12px;font-weight:600;cursor:pointer;' +
                'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
                'transition:background 0.15s;';
            btn.addEventListener('mouseover', function () { btn.style.background = '#1e6b27'; });
            btn.addEventListener('mouseout',  function () { btn.style.background = '#2a8234'; });
            btn.addEventListener('click', function () {
                btn.textContent = '⏳ Generating…';
                btn.disabled = true;
                generateCard(
                    window._lastPatchProps,
                    window._lastPatchLngLat,
                    window._lastPatchGeometry
                ).then(function () {
                    btn.textContent = '⬇ Download report card';
                    btn.disabled = false;
                }).catch(function () {
                    btn.textContent = '⬇ Download report card';
                    btn.disabled = false;
                });
            });
            content.appendChild(btn);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ── Main card generator ───────────────────────────────────────────────────
    function generateCard(p, lngLat, geometry) {
        return new Promise(function (resolve) {
            var lat = lngLat ? lngLat.lat : null;
            var lng = lngLat ? lngLat.lng : null;
            fetchPlaceName(lat, lng).then(function (placeName) {
                renderCard(p, lat, lng, geometry, placeName);
                resolve();
            });
        });
    }

    // ── Reverse geocode ───────────────────────────────────────────────────────
    function fetchPlaceName(lat, lng) {
        return new Promise(function (resolve) {
            if (!lat || !lng) { resolve(null); return; }
            var url = 'https://nominatim.openstreetmap.org/reverse?lat=' + lat +
                '&lon=' + lng + '&format=json&zoom=14&addressdetails=1';
            fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'myforestconnect.online' } })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var a    = data.address || {};
                    var name = data.name ||
                        a.nature_reserve || a.forest || a.park ||
                        a.suburb || a.village || a.town ||
                        a.county || a.state_district || null;
                    resolve(name || null);
                })
                .catch(function () { resolve(null); });
        });
    }

    // ── Tier helpers ──────────────────────────────────────────────────────────
    function displayName(tierInternal) {
        var DISP = window.TIER_DISPLAY_NAMES || {};
        return DISP[tierInternal] || tierInternal || 'Unknown';
    }

    var TIER_ORDER = [
        'Tier 1 (Core Habitat)',
        'Tier 2 (Major Stepping Stones)',
        'Tier 3 (Connected Fragments)',
        'Tier 4 (Vulnerable Edge Fragments)',
        'Tier 5 (Isolated Fragments)',
        'Tier 6 (Isolated Micro Patches)'
    ];
    var TIER_COLORS_FB = [
        '#b1eaac','#8ad284','#5aaf64','#2a8234','#1e6b27','#0a4c12'
    ];
    function tierIndex(t) { var i = TIER_ORDER.indexOf(t); return i >= 0 ? i : -1; }
    function tierCol(i) {
        var TC = window.TIER_COLORS || {};
        return TC[TIER_ORDER[i]] || TIER_COLORS_FB[i] || '#2a8234';
    }

    // ── QR URL ────────────────────────────────────────────────────────────────
    function qrUrl(lat, lng) {
        var mapUrl = 'https://myforestconnect.online';
        if (lat && lng) {
            var page = lng < 102.5 ? 'klang-valley-map.html' : 'kuantan-map.html';
            mapUrl = 'https://myforestconnect.online/' + page +
                '#15.00/' + lat.toFixed(5) + '/' + lng.toFixed(5);
        }
        return 'https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=' +
            encodeURIComponent(mapUrl) + '&bgcolor=ffffff&color=1a3d1a&margin=6';
    }

    // ── Draw patch shape ──────────────────────────────────────────────────────
    function drawShape(ctx, geometry, x, y, w, h, fillColor, strokeColor) {
        if (!geometry || !geometry.coordinates) return;
        var allPts = [];
        var coords = geometry.coordinates;
        if (geometry.type === 'Polygon') {
            coords[0].forEach(function (c) { allPts.push(c); });
        } else if (geometry.type === 'MultiPolygon') {
            coords.forEach(function (poly) { poly[0].forEach(function (c) { allPts.push(c); }); });
        }
        if (!allPts.length) return;

        var minX = allPts[0][0], maxX = allPts[0][0];
        var minY = allPts[0][1], maxY = allPts[0][1];
        allPts.forEach(function (c) {
            if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0];
            if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1];
        });
        var rangeX = maxX - minX || 0.0001;
        var rangeY = maxY - minY || 0.0001;
        var scale  = Math.min(w / rangeX, h / rangeY) * 0.85;
        var offX   = x + w / 2 - (minX + rangeX / 2) * scale;
        var offY   = y + h / 2 + (minY + rangeY / 2) * scale;

        function project(c) { return [c[0] * scale + offX, -c[1] * scale + offY]; }

        function drawRing(ring) {
            var pt = project(ring[0]);
            ctx.moveTo(pt[0], pt[1]);
            for (var i = 1; i < ring.length; i++) { pt = project(ring[i]); ctx.lineTo(pt[0], pt[1]); }
            ctx.closePath();
        }

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 6; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
        ctx.beginPath();
        if (geometry.type === 'Polygon') { drawRing(coords[0]); }
        else { coords.forEach(function (poly) { drawRing(poly[0]); }); }
        ctx.fillStyle = fillColor; ctx.fill();
        ctx.restore();

        ctx.beginPath();
        if (geometry.type === 'Polygon') { drawRing(coords[0]); }
        else { coords.forEach(function (poly) { drawRing(poly[0]); }); }
        ctx.strokeStyle = strokeColor; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // ── Render ────────────────────────────────────────────────────────────────
    function renderCard(p, lat, lng, geometry, placeName) {
        var TC = window.TIER_COLORS || {};
        var CC = { High:'#52b788', Moderate:'#f7ce46', Low:'#e07c1f', Barrier:'#6b3fa0', 'No Data':'#aaa' };

        var tierInternal = p.Tier || '';
        var tierLabel    = displayName(tierInternal);
        var tierColor    = TC[tierInternal] || '#2a8234';
        var tIdx         = tierIndex(tierInternal);
        var conn         = p.connectivity || 'No Data';
        var connColor    = CC[conn] || '#aaa';
        var connText     = (conn === 'High' || conn === 'Moderate') ? '#1a1a1a' : '#fff';

        // ── Canvas setup ──────────────────────────────────────────────────────
        // W=800, H=580, rendered at 2× for retina sharpness
        var W = 800, H = 580, SC = 2;
        var canvas = document.createElement('canvas');
        canvas.width = W * SC; canvas.height = H * SC;
        var ctx = canvas.getContext('2d');
        ctx.scale(SC, SC);
        var F = 'Arial, sans-serif';

        // ── Layout constants ──────────────────────────────────────────────────
        var PAD      = 24;   // outer padding
        var HDR_H    = 80;   // header height
        var BDGE_Y   = 96;   // badge row top
        var BDGE_H   = 42;   // badge height
        var BAR_Y    = 156;  // spectrum bar top
        var BAR_H    = 22;
        var CONT_Y   = 218;  // content area top (below bar + pointer label)
        var FOOT_Y   = H - 40; // footer top
        var LEFT_W   = 190;  // shape column width
        var RIGHT_X  = PAD + LEFT_W + 14; // metrics column left
        var RIGHT_W  = W - RIGHT_X - PAD;

        // ── Background ────────────────────────────────────────────────────────
        ctx.fillStyle = '#f5f3ee'; ctx.fillRect(0, 0, W, H);

        // ── Left accent stripe ────────────────────────────────────────────────
        ctx.fillStyle = tierColor; ctx.fillRect(0, 0, 7, H);

        // ── Header ────────────────────────────────────────────────────────────
        ctx.fillStyle = '#1a3d1a'; ctx.fillRect(7, 0, W - 7, HDR_H);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        for (var xi = 20; xi < W; xi += 18)
            for (var yi = 6; yi < HDR_H; yi += 18)
                circ(ctx, xi, yi, 2);

        // Title
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px ' + F;
        ctx.fillText('Forest Patch Report Card', PAD, 28);

        // Subtitle / place name
        if (placeName) {
            // Truncate if too long
            var maxPNW = W - PAD * 2 - 220;
            ctx.font = '12px ' + F;
            ctx.fillStyle = '#a5d6a7';
            var pn = placeName;
            while (ctx.measureText(pn).width > maxPNW && pn.length > 6)
                pn = pn.slice(0, -1);
            if (pn !== placeName) pn += '…';
            ctx.fillText(pn, PAD, 48);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.font = '10px ' + F;
            ctx.fillText('Nearest named area', PAD, 64);
        } else {
            ctx.font = '12px ' + F;
            ctx.fillStyle = '#a5d6a7';
            ctx.fillText('myforestconnect.online', PAD, 50);
        }

        // Patch ID — top right
        if (p.id != null) {
            ctx.font = '11px ' + F;
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            var idTxt = 'Patch #' + p.id;
            ctx.fillText(idTxt, W - ctx.measureText(idTxt).width - PAD, 28);
        }
        // Website — bottom right of header
        ctx.font = '10px ' + F; ctx.fillStyle = 'rgba(165,214,167,0.7)';
        var site = 'myforestconnect.online';
        ctx.fillText(site, W - ctx.measureText(site).width - PAD, 64);

        // ── Badge row ─────────────────────────────────────────────────────────
        // 1. Tier badge
        ctx.fillStyle = tierColor;
        rrect(ctx, PAD, BDGE_Y, 240, BDGE_H, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        rrect(ctx, PAD + 1, BDGE_Y + 1, 238, 20, 5); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 14px ' + F;
        ctx.fillText(tierLabel, PAD + 14, BDGE_Y + 27);

        // 2. Connectivity badge
        var b2x = PAD + 252;
        ctx.fillStyle = connColor;
        rrect(ctx, b2x, BDGE_Y, 148, BDGE_H, 6); ctx.fill();
        ctx.fillStyle = connText;
        ctx.font = '10px ' + F; ctx.fillText('Connectivity', b2x + 14, BDGE_Y + 15);
        ctx.font = 'bold 14px ' + F; ctx.fillText(conn, b2x + 14, BDGE_Y + 32);

        // 3. Coordinates badge
        var b3x = b2x + 160;
        if (lat && lng) {
            ctx.fillStyle = '#2d6a4f';
            rrect(ctx, b3x, BDGE_Y, W - b3x - PAD, BDGE_H, 6); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '10px ' + F; ctx.fillText('📍 Location', b3x + 14, BDGE_Y + 15);
            ctx.font = 'bold 12px ' + F;
            ctx.fillText(lat.toFixed(5) + '°N', b3x + 14, BDGE_Y + 31);
            ctx.fillText(lng.toFixed(5) + '°E', b3x + 14 + 110, BDGE_Y + 31);
        }

        // ── Tier spectrum bar ─────────────────────────────────────────────────
        var barW   = W - PAD * 2;
        var segW   = barW / 6;

        // Axis labels — above bar
        ctx.font = '9px ' + F; ctx.fillStyle = '#aaa';
        ctx.fillText('← Higher structural quality', PAD, BAR_Y - 5);
        var rTxt = 'Lower structural quality →';
        ctx.fillText(rTxt, PAD + barW - ctx.measureText(rTxt).width, BAR_Y - 5);

        // Segments
        for (var si = 0; si < 6; si++) {
            var sx = PAD + si * segW;
            var sc2 = tierCol(si);
            if (si === 0) {
                rrect(ctx, sx, BAR_Y, segW, BAR_H, 4); ctx.fillStyle = sc2; ctx.fill();
                ctx.fillRect(sx + segW - 4, BAR_Y, 4, BAR_H);
            } else if (si === 5) {
                rrect(ctx, sx, BAR_Y, segW, BAR_H, 4); ctx.fillStyle = sc2; ctx.fill();
                ctx.fillRect(sx, BAR_Y, 4, BAR_H);
            } else {
                ctx.fillStyle = sc2; ctx.fillRect(sx, BAR_Y, segW, BAR_H);
            }
            ctx.fillStyle = si < 2 ? '#1b4332' : '#fff';
            ctx.font = 'bold 9px ' + F;
            var tLbl = 'T' + (si + 1);
            ctx.fillText(tLbl, sx + segW / 2 - ctx.measureText(tLbl).width / 2, BAR_Y + 14);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
        rrect(ctx, PAD, BAR_Y, barW, BAR_H, 4); ctx.stroke();

        // Pointer triangle
        if (tIdx >= 0) {
            var mX = PAD + tIdx * segW + segW / 2;
            ctx.fillStyle = tierColor;
            ctx.beginPath();
            ctx.moveTo(mX - 6, BAR_Y + BAR_H + 2);
            ctx.lineTo(mX + 6, BAR_Y + BAR_H + 2);
            ctx.lineTo(mX,     BAR_Y + BAR_H + 9);
            ctx.closePath(); ctx.fill();

            // Short tier name below pointer
            var shortName = tierLabel.indexOf('(') >= 0
                ? tierLabel.split('(')[1].replace(')', '').trim()
                : tierLabel;
            ctx.font = 'bold 9px ' + F; ctx.fillStyle = tierColor;
            var snW = ctx.measureText(shortName).width;
            var snX = Math.max(PAD, Math.min(PAD + barW - snW, mX - snW / 2));
            ctx.fillText(shortName, snX, BAR_Y + BAR_H + 20);
        }

        // ── Content area ──────────────────────────────────────────────────────
        // Left: shape panel
        var SHAPE_H = 210;
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        rrect(ctx, PAD + 2, CONT_Y + 2, LEFT_W, SHAPE_H, 8); ctx.fill();
        ctx.fillStyle = '#ffffff';
        rrect(ctx, PAD, CONT_Y, LEFT_W, SHAPE_H, 8); ctx.fill();
        ctx.strokeStyle = '#e0dbd0'; ctx.lineWidth = 1;
        rrect(ctx, PAD, CONT_Y, LEFT_W, SHAPE_H, 8); ctx.stroke();

        ctx.fillStyle = '#aaa'; ctx.font = 'bold 9px ' + F;
        ctx.fillText('PATCH SHAPE', PAD + 10, CONT_Y + 16);

        if (geometry) {
            drawShape(ctx, geometry,
                PAD + 10, CONT_Y + 22, LEFT_W - 20, SHAPE_H - 32,
                hexToRgba(tierColor, 0.3), tierColor);
        } else {
            ctx.fillStyle = '#ccc'; ctx.font = '11px ' + F;
            ctx.fillText('Shape unavailable', PAD + 20, CONT_Y + SHAPE_H / 2);
        }

        // Left: QR code panel — sits below shape with gap
        var QR_Y    = CONT_Y + SHAPE_H + 12;
        var QR_SIZE = 70;
        var QR_BOX  = QR_SIZE + 10;
        // We draw the QR asynchronously — placeholder box for now
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        rrect(ctx, PAD + 2, QR_Y + 2, LEFT_W, QR_BOX + 24, 8); ctx.fill();
        ctx.fillStyle = '#ffffff';
        rrect(ctx, PAD, QR_Y, LEFT_W, QR_BOX + 24, 8); ctx.fill();
        ctx.strokeStyle = '#e0dbd0'; ctx.lineWidth = 1;
        rrect(ctx, PAD, QR_Y, LEFT_W, QR_BOX + 24, 8); ctx.stroke();

        ctx.fillStyle = '#aaa'; ctx.font = 'bold 9px ' + F;
        ctx.fillText('OPEN IN PLATFORM', PAD + 10, QR_Y + 14);

        // Right: metrics — 2 columns × 3 rows
        var nv = function (v) { return v != null ? parseFloat(v) : null; };
        var metrics = [
            { label:'Total area',       value: nv(p.area)      != null ? nv(p.area).toFixed(2)      : '—', unit:'ha' },
            { label:'Core area',        value: nv(p.core)      != null ? nv(p.core).toFixed(2)      : '—', unit:'ha' },
            { label:'Contiguity index', value: nv(p.contig)    != null ? nv(p.contig).toFixed(3)    : '—', unit:'0–1' },
            { label:'ENN distance',     value: nv(p.enn)       != null ? Math.round(nv(p.enn)) + '' : '—', unit:'m' },
            { label:'Perim-area ratio', value: nv(p.para)      != null ? nv(p.para).toFixed(5)      : '—', unit:'' },
            { label:'Mean flow',        value: nv(p.mean_flow) != null ? nv(p.mean_flow).toFixed(2) : '—', unit:'' }
        ];

        var mCols = 2;
        var mGap  = 10;
        var mW    = (RIGHT_W - mGap) / mCols;
        var mH    = 84;

        ctx.fillStyle = '#aaa'; ctx.font = 'bold 9px ' + F;
        ctx.fillText('STRUCTURAL METRICS', RIGHT_X, CONT_Y - 6);

        metrics.forEach(function (m, i) {
            var col = i % mCols, row = Math.floor(i / mCols);
            var mx  = RIGHT_X + col * (mW + mGap);
            var my  = CONT_Y + row * (mH + mGap);

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.05)';
            rrect(ctx, mx + 2, my + 2, mW, mH, 6); ctx.fill();
            // Card
            ctx.fillStyle = '#ffffff';
            rrect(ctx, mx, my, mW, mH, 6); ctx.fill();
            ctx.strokeStyle = '#e8e4de'; ctx.lineWidth = 1;
            rrect(ctx, mx, my, mW, mH, 6); ctx.stroke();
            // Left accent
            ctx.fillStyle = tierColor; ctx.fillRect(mx, my, 4, mH);

            // Label
            ctx.fillStyle = '#aaa'; ctx.font = '9px ' + F;
            ctx.fillText(m.label.toUpperCase(), mx + 12, my + 17);
            // Value
            ctx.fillStyle = '#1a3d1a'; ctx.font = 'bold 22px ' + F;
            ctx.fillText(m.value, mx + 12, my + 52);
            // Unit
            if (m.unit) {
                ctx.fillStyle = '#bbb'; ctx.font = '11px ' + F;
                ctx.fillText(m.unit, mx + 12, my + 70);
            }
        });

        // ── Footer (drawn synchronously) ──────────────────────────────────────
        function drawFooter() {
            ctx.fillStyle = '#1a3d1a'; ctx.fillRect(0, FOOT_Y, W, H - FOOT_Y);
            ctx.fillStyle = tierColor;  ctx.fillRect(0, FOOT_Y, 7, H - FOOT_Y);
            ctx.fillStyle = '#ffffff'; ctx.font = '11px ' + F;
            var d = new Date().toLocaleDateString('en-GB', {
                day:'numeric', month:'long', year:'numeric'
            });
            ctx.fillText('Generated ' + d, 20, FOOT_Y + 24);
            ctx.fillStyle = '#a5d6a7'; ctx.font = '10px ' + F;
            var disc = 'For research and awareness purposes only  ·  myforestconnect.online';
            ctx.fillText(disc, W - ctx.measureText(disc).width - PAD, FOOT_Y + 24);
        }

        // ── Load QR then finalise ─────────────────────────────────────────────
        var qrImg = new Image();
        qrImg.crossOrigin = 'anonymous';
        qrImg.onload = function () {
            // Draw QR centred in the QR panel
            var qrDrawX = PAD + (LEFT_W - QR_SIZE) / 2;
            ctx.drawImage(qrImg, qrDrawX, QR_Y + 18, QR_SIZE, QR_SIZE);

            ctx.fillStyle = '#bbb'; ctx.font = '9px ' + F;
            var scanTxt = 'Scan to open in platform';
            ctx.fillText(scanTxt,
                PAD + (LEFT_W - ctx.measureText(scanTxt).width) / 2,
                QR_Y + 18 + QR_SIZE + 12);

            drawFooter();
            download();
        };
        qrImg.onerror = function () { drawFooter(); download(); };
        qrImg.src = qrUrl(lat, lng);

        function download() {
            var a = document.createElement('a');
            a.download = 'patch_' + (p.id != null ? p.id : 'report') + '_report_card.png';
            a.href = canvas.toDataURL('image/png', 1.0);
            a.click();
        }
    }

    // ── Canvas helpers ────────────────────────────────────────────────────────
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
    function circ(ctx, x, y, r) {
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
    function hexToRgba(hex, alpha) {
        var r = parseInt(hex.slice(1,3),16);
        var g = parseInt(hex.slice(3,5),16);
        var b = parseInt(hex.slice(5,7),16);
        return 'rgba('+r+','+g+','+b+','+alpha+')';
    }

    // ── Boot ──────────────────────────────────────────────────────────────────
    if (document.readyState !== 'loading') { initReportCards(); }
    else { document.addEventListener('DOMContentLoaded', initReportCards); }

})();
