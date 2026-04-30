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
                txt === 'No data for this patch.' ||
                txt === 'Select a patch on the map') return;

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

            // Fetch reverse geocode name then render
            fetchPlaceName(lat, lng).then(function (placeName) {
                renderCard(p, lat, lng, geometry, placeName);
                resolve();
            });
        });
    }

    // ── Reverse geocode via Nominatim ─────────────────────────────────────────
    function fetchPlaceName(lat, lng) {
        return new Promise(function (resolve) {
            if (!lat || !lng) { resolve(null); return; }
            var url = 'https://nominatim.openstreetmap.org/reverse?lat=' + lat +
                '&lon=' + lng + '&format=json&zoom=14&addressdetails=1';
            fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'myforestconnect.online' } })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    // Prefer forest/nature_reserve/park name, fall back to suburb/village/county
                    var a   = data.address || {};
                    var name = data.name ||
                        a.nature_reserve || a.forest || a.park ||
                        a.suburb || a.village || a.town ||
                        a.county || a.state_district || null;
                    resolve(name || null);
                })
                .catch(function () { resolve(null); });
        });
    }

    // ── Tier display helpers ──────────────────────────────────────────────────
    function displayName(tierInternal) {
        var DISP = window.TIER_DISPLAY_NAMES || {};
        return DISP[tierInternal] || tierInternal || 'Unknown';
    }

    // Tier order for the spectrum bar (internal names)
    var TIER_ORDER = [
        'Tier 1 (Core Habitat)',
        'Tier 2 (Major Stepping Stones)',
        'Tier 3 (Connected Fragments)',
        'Tier 4 (Vulnerable Edge Fragments)',
        'Tier 5 (Isolated Fragments)',
        'Tier 6 (Isolated Micro Patches)'
    ];
    var TIER_COLORS_DEFAULT = [
        '#b1eaac','#8ad284','#5aaf64','#2a8234','#1e6b27','#0a4c12'
    ];

    function tierIndex(tierInternal) {
        var idx = TIER_ORDER.indexOf(tierInternal);
        return idx >= 0 ? idx : -1;
    }

    // ── QR code URL ───────────────────────────────────────────────────────────
    function qrUrl(lat, lng, zoom) {
        var z = zoom || 15;
        var mapUrl = 'https://myforestconnect.online';
        // Attempt to link to the specific map view with hash
        if (lat && lng) {
            var isKV = lng < 102.5;
            var page = isKV ? 'klang-valley-map.html' : 'kuantan-map.html';
            mapUrl = 'https://myforestconnect.online/' + page +
                '#' + z.toFixed(2) + '/' + lat.toFixed(5) + '/' + lng.toFixed(5);
        }
        return 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' +
            encodeURIComponent(mapUrl) + '&bgcolor=f5f3ee&color=1a3d1a&margin=4';
    }

    // ── Draw patch shape from GeoJSON geometry ────────────────────────────────
    function drawShape(ctx, geometry, x, y, w, h, fillColor, strokeColor) {
        if (!geometry || !geometry.coordinates) return;

        // Collect all ring points to find bounding box
        var allPts = [];
        var coords = geometry.coordinates;
        // Handle Polygon and MultiPolygon
        if (geometry.type === 'Polygon') {
            coords[0].forEach(function (c) { allPts.push(c); });
        } else if (geometry.type === 'MultiPolygon') {
            coords.forEach(function (poly) {
                poly[0].forEach(function (c) { allPts.push(c); });
            });
        }
        if (!allPts.length) return;

        var minX = allPts[0][0], maxX = allPts[0][0];
        var minY = allPts[0][1], maxY = allPts[0][1];
        allPts.forEach(function (c) {
            if (c[0] < minX) minX = c[0];
            if (c[0] > maxX) maxX = c[0];
            if (c[1] < minY) minY = c[1];
            if (c[1] > maxY) maxY = c[1];
        });

        var rangeX = maxX - minX || 0.0001;
        var rangeY = maxY - minY || 0.0001;
        var scale  = Math.min(w / rangeX, h / rangeY) * 0.88;
        var offX   = x + w / 2 - (minX + rangeX / 2) * scale;
        var offY   = y + h / 2 + (minY + rangeY / 2) * scale;

        function project(c) {
            return [c[0] * scale + offX, -c[1] * scale + offY];
        }

        // Draw shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.18)';
        ctx.shadowBlur  = 8;
        ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;

        function drawRing(ring) {
            var pt = project(ring[0]);
            ctx.moveTo(pt[0], pt[1]);
            for (var i = 1; i < ring.length; i++) {
                pt = project(ring[i]);
                ctx.lineTo(pt[0], pt[1]);
            }
            ctx.closePath();
        }

        ctx.beginPath();
        if (geometry.type === 'Polygon') {
            drawRing(coords[0]);
        } else if (geometry.type === 'MultiPolygon') {
            coords.forEach(function (poly) { drawRing(poly[0]); });
        }
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        if (geometry.type === 'Polygon') {
            drawRing(coords[0]);
        } else if (geometry.type === 'MultiPolygon') {
            coords.forEach(function (poly) { drawRing(poly[0]); });
        }
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth   = 1.5;
        ctx.stroke();
    }

    // ── Render the card ───────────────────────────────────────────────────────
    function renderCard(p, lat, lng, geometry, placeName) {
        var TC  = window.TIER_COLORS || {};
        var CC  = { High:'#52b788', Moderate:'#f7ce46', Low:'#e07c1f', Barrier:'#6b3fa0', 'No Data':'#aaa' };

        var tierInternal = p.Tier || '';
        var tierLabel    = displayName(tierInternal);
        var tierColor    = TC[tierInternal] || '#2a8234';
        var tierIdx      = tierIndex(tierInternal);  // 0–5
        var conn         = p.connectivity || 'No Data';
        var connColor    = CC[conn] || '#aaa';
        var connText     = (conn === 'High' || conn === 'Moderate') ? '#1a1a1a' : '#ffffff';

        var W = 800, H = 520, SC = 2;
        var canvas = document.createElement('canvas');
        canvas.width  = W * SC;
        canvas.height = H * SC;
        var ctx = canvas.getContext('2d');
        ctx.scale(SC, SC);

        var F = 'Arial, sans-serif';

        // ── Background ────────────────────────────────────────────────────────
        ctx.fillStyle = '#f5f3ee';
        ctx.fillRect(0, 0, W, H);

        // ── Left accent stripe ────────────────────────────────────────────────
        ctx.fillStyle = tierColor;
        ctx.fillRect(0, 0, 7, H);

        // ── Header band ───────────────────────────────────────────────────────
        ctx.fillStyle = '#1a3d1a';
        ctx.fillRect(7, 0, W - 7, 82);

        // Header dot texture
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        for (var xi = 20; xi < W; xi += 18)
            for (var yi = 6; yi < 82; yi += 18)
                circ(ctx, xi, yi, 2);

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 19px ' + F;
        ctx.fillText('Forest Patch Report Card', 24, 30);
        ctx.font = '12px ' + F;
        ctx.fillStyle = '#a5d6a7';
        ctx.fillText('myforestconnect.online', 24, 52);

        // Place name in header (right side)
        if (placeName) {
            ctx.font = 'bold 13px ' + F;
            ctx.fillStyle = '#c8e6c9';
            var pnW = ctx.measureText(placeName).width;
            ctx.fillText(placeName, W - pnW - 20, 34);
            ctx.font = '10px ' + F;
            ctx.fillStyle = '#a5d6a7';
            ctx.fillText('Nearest named area', W - ctx.measureText('Nearest named area').width - 20, 52);
        }

        // Patch ID small tag
        if (p.id != null) {
            var idTxt = 'Patch #' + p.id;
            ctx.font = '11px ' + F;
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillText(idTxt, 24, 70);
        }

        // ── Tier badge ────────────────────────────────────────────────────────
        ctx.fillStyle = tierColor;
        rrect(ctx, 24, 98, 270, 42, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        rrect(ctx, 25, 99, 268, 20, 5); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px ' + F;
        ctx.fillText(tierLabel, 38, 124);

        // ── Connectivity badge ────────────────────────────────────────────────
        ctx.fillStyle = connColor;
        rrect(ctx, 306, 98, 148, 42, 6); ctx.fill();
        ctx.fillStyle = connText;
        ctx.font = '11px ' + F; ctx.fillText('Connectivity', 320, 114);
        ctx.font = 'bold 15px ' + F; ctx.fillText(conn, 320, 132);

        // ── Coordinates badge ─────────────────────────────────────────────────
        if (lat && lng) {
            ctx.fillStyle = '#2d6a4f';
            rrect(ctx, 466, 98, 192, 42, 6); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = '11px ' + F; ctx.fillText('📍 Coordinates', 480, 114);
            ctx.font = 'bold 12px ' + F;
            ctx.fillText(lat.toFixed(5) + '\u00b0N,  ' + lng.toFixed(5) + '\u00b0E', 480, 132);
        }

        // ── TIER SPECTRUM BAR ─────────────────────────────────────────────────
        var barX = 24, barY = 156, barW = W - 48, barH = 22;
        var segW = barW / 6;

        // Draw 6 tier segments
        TIER_ORDER.forEach(function (tier, i) {
            var segX = barX + i * segW;
            var col  = (window.TIER_COLORS && window.TIER_COLORS[tier])
                ? window.TIER_COLORS[tier] : TIER_COLORS_DEFAULT[i];
            // Round left end of first, right end of last
            if (i === 0) {
                rrect(ctx, segX, barY, segW, barH, 4);
                ctx.fillStyle = col; ctx.fill();
                // Square off right side
                ctx.fillRect(segX + segW - 4, barY, 4, barH);
            } else if (i === 5) {
                rrect(ctx, segX, barY, segW, barH, 4);
                ctx.fillStyle = col; ctx.fill();
                ctx.fillRect(segX, barY, 4, barH);
            } else {
                ctx.fillStyle = col;
                ctx.fillRect(segX, barY, segW, barH);
            }
            // Tier label inside segment
            ctx.fillStyle = i < 2 ? '#1b4332' : '#ffffff';
            ctx.font = 'bold 9px ' + F;
            var lbl = 'T' + (i + 1);
            ctx.fillText(lbl, segX + segW / 2 - ctx.measureText(lbl).width / 2, barY + 14);
        });

        // Bar frame
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1;
        rrect(ctx, barX, barY, barW, barH, 4); ctx.stroke();

        // Current tier marker — triangle pointer below bar
        if (tierIdx >= 0) {
            var markerX = barX + tierIdx * segW + segW / 2;
            ctx.fillStyle = tierColor;
            ctx.beginPath();
            ctx.moveTo(markerX - 7, barY + barH + 2);
            ctx.lineTo(markerX + 7, barY + barH + 2);
            ctx.lineTo(markerX, barY + barH + 11);
            ctx.closePath(); ctx.fill();

            // Label below pointer
            ctx.font = 'bold 10px ' + F;
            ctx.fillStyle = tierColor;
            var shortName = tierLabel.split('(')[1] ? tierLabel.split('(')[1].replace(')', '') : tierLabel;
            var lblW = ctx.measureText(shortName).width;
            ctx.fillText(shortName, Math.max(barX, Math.min(barX + barW - lblW, markerX - lblW / 2)), barY + barH + 24);
        }

        // Axis labels
        ctx.font = '9px ' + F; ctx.fillStyle = '#999';
        ctx.fillText('Higher structural quality', barX, barY - 4);
        var rTxt = 'Lower structural quality';
        ctx.fillText(rTxt, barX + barW - ctx.measureText(rTxt).width, barY - 4);

        // ── LEFT COLUMN: patch shape ──────────────────────────────────────────
        var shapeX = 24, shapeY = 210, shapeW = 200, shapeH = 200;

        // Shape card background
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        rrect(ctx, shapeX + 2, shapeY + 2, shapeW, shapeH, 8); ctx.fill();
        ctx.fillStyle = '#ffffff';
        rrect(ctx, shapeX, shapeY, shapeW, shapeH, 8); ctx.fill();
        ctx.strokeStyle = '#e0dbd0'; ctx.lineWidth = 1;
        rrect(ctx, shapeX, shapeY, shapeW, shapeH, 8); ctx.stroke();

        // Section label
        ctx.fillStyle = '#999'; ctx.font = 'bold 9px ' + F;
        ctx.fillText('PATCH SHAPE', shapeX + 8, shapeY + 16);

        if (geometry) {
            var shapeAlpha = tierColor;
            drawShape(ctx, geometry,
                shapeX + 10, shapeY + 22, shapeW - 20, shapeH - 32,
                hexToRgba(tierColor, 0.35), tierColor);
        } else {
            ctx.fillStyle = '#ccc'; ctx.font = '11px ' + F;
            ctx.fillText('Shape unavailable', shapeX + 20, shapeY + shapeH / 2);
        }

        // ── RIGHT COLUMN: metric cards ────────────────────────────────────────
        var nv   = function (v) { return v != null ? parseFloat(v) : null; };
        var metrics = [
            { label:'Total area',       value: nv(p.area)      != null ? nv(p.area).toFixed(2)      : '\u2014', unit:'ha' },
            { label:'Core area',        value: nv(p.core)      != null ? nv(p.core).toFixed(2)      : '\u2014', unit:'ha' },
            { label:'Contiguity',       value: nv(p.contig)    != null ? nv(p.contig).toFixed(3)    : '\u2014', unit:'0\u20131' },
            { label:'ENN distance',     value: nv(p.enn)       != null ? Math.round(nv(p.enn)) + '' : '\u2014', unit:'m' },
            { label:'Perim-area ratio', value: nv(p.para)      != null ? nv(p.para).toFixed(5)      : '\u2014', unit:'' },
            { label:'Mean flow',        value: nv(p.mean_flow) != null ? nv(p.mean_flow).toFixed(2) : '\u2014', unit:'' }
        ];

        var mStartX = 238, mStartY = 210;
        var mCols   = 3;
        var mW      = (W - mStartX - 24 - (mCols - 1) * 8) / mCols;
        var mH      = 58;

        ctx.fillStyle = '#999'; ctx.font = 'bold 9px ' + F;
        ctx.fillText('STRUCTURAL METRICS', mStartX, mStartY - 6);

        metrics.forEach(function (m, i) {
            var col = i % mCols, row = Math.floor(i / mCols);
            var x   = mStartX + col * (mW + 8);
            var y   = mStartY + row * (mH + 8);

            ctx.fillStyle = 'rgba(0,0,0,0.04)';
            rrect(ctx, x+2, y+2, mW, mH, 5); ctx.fill();
            ctx.fillStyle = '#ffffff';
            rrect(ctx, x, y, mW, mH, 5); ctx.fill();
            ctx.strokeStyle = '#e8e4de'; ctx.lineWidth = 1;
            rrect(ctx, x, y, mW, mH, 5); ctx.stroke();

            ctx.fillStyle = tierColor; ctx.fillRect(x, y, 4, mH);

            ctx.fillStyle = '#999'; ctx.font = '9px ' + F;
            ctx.fillText(m.label.toUpperCase(), x + 10, y + 15);

            ctx.fillStyle = '#1a3d1a'; ctx.font = 'bold 17px ' + F;
            ctx.fillText(m.value, x + 10, y + 40);

            if (m.unit) {
                ctx.fillStyle = '#bbb'; ctx.font = '10px ' + F;
                ctx.fillText(m.unit, x + 10, y + 52);
            }
        });

        // ── QR CODE ───────────────────────────────────────────────────────────
        var qrX = 24, qrY = 428, qrSize = 60;
        var qrSrc = qrUrl(lat, lng, 15);
        var img   = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            // QR box
            ctx.fillStyle = '#ffffff';
            rrect(ctx, qrX, qrY, qrSize + 8, qrSize + 8, 4); ctx.fill();
            ctx.strokeStyle = '#e0dbd0'; ctx.lineWidth = 1;
            rrect(ctx, qrX, qrY, qrSize + 8, qrSize + 8, 4); ctx.stroke();
            ctx.drawImage(img, qrX + 4, qrY + 4, qrSize, qrSize);

            ctx.fillStyle = '#888'; ctx.font = '9px ' + F;
            ctx.fillText('Scan to open in platform', qrX, qrY + qrSize + 18);

            finishCard();
        };
        img.onerror = function () { finishCard(); };
        img.src = qrSrc;

        function finishCard() {
            // ── Footer ────────────────────────────────────────────────────────
            ctx.fillStyle = '#1a3d1a';
            ctx.fillRect(0, H - 38, W, 38);
            ctx.fillStyle = tierColor;
            ctx.fillRect(0, H - 38, 7, 38);

            ctx.fillStyle = '#ffffff'; ctx.font = '11px ' + F;
            var d = new Date().toLocaleDateString('en-GB', {
                day:'numeric', month:'long', year:'numeric'
            });
            ctx.fillText('Generated ' + d, 20, H - 17);

            ctx.fillStyle = '#a5d6a7'; ctx.font = '11px ' + F;
            var site = 'myforestconnect.online  ·  For research and awareness purposes only';
            ctx.fillText(site, W - ctx.measureText(site).width - 18, H - 17);

            // ── Download ──────────────────────────────────────────────────────
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
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    // ── QR URL builder ────────────────────────────────────────────────────────
    function qrUrl(lat, lng, zoom) {
        var mapUrl = 'https://myforestconnect.online';
        if (lat && lng) {
            var page = lng < 102.5 ? 'klang-valley-map.html' : 'kuantan-map.html';
            mapUrl = 'https://myforestconnect.online/' + page +
                '#' + zoom.toFixed(2) + '/' + lat.toFixed(5) + '/' + lng.toFixed(5);
        }
        return 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' +
            encodeURIComponent(mapUrl) +
            '&bgcolor=f5f3ee&color=1a3d1a&margin=4';
    }

    // ── Boot ──────────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        initReportCards();
    });

    // Also init immediately in case DOMContentLoaded already fired
    if (document.readyState !== 'loading') {
        initReportCards();
    }

})();
