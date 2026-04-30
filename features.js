// features.js — myforestconnect retro report cards
//
// HOW TO USE:
//   Add ONE line before <script src="config.js"> in each map HTML file:
//       <script src="features.js"></script>
//   Remove that line to revert completely.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
    'use strict';

    // ── Load Press Start 2P font (retro pixel font) ───────────────────────────
    var _fontLoaded = false;
    var _fontFace   = null;
    (function () {
        var link = document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
        document.head.appendChild(link);
        // Give it a moment to load, then mark ready
        setTimeout(function () { _fontLoaded = true; }, 1500);
    })();

    // ── Intercept mapboxgl.Map ────────────────────────────────────────────────
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

    // ── Inject report card button ─────────────────────────────────────────────
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
            btn.textContent = '\u2b07 Download report card';
            btn.style.cssText =
                'display:block;width:100%;margin-top:10px;padding:8px 10px;' +
                'background:#2a8234;color:white;border:none;border-radius:4px;' +
                'font-size:12px;font-weight:600;cursor:pointer;' +
                'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
                'transition:background 0.15s;';
            btn.addEventListener('mouseover', function () { btn.style.background = '#1e6b27'; });
            btn.addEventListener('mouseout',  function () { btn.style.background = '#2a8234'; });
            btn.addEventListener('click', function () {
                btn.textContent = '\u23f3 Generating\u2026';
                btn.disabled = true;
                generateCard(
                    window._lastPatchProps,
                    window._lastPatchLngLat,
                    window._lastPatchGeometry
                ).then(function () {
                    btn.textContent = '\u2b07 Download report card';
                    btn.disabled = false;
                }).catch(function () {
                    btn.textContent = '\u2b07 Download report card';
                    btn.disabled = false;
                });
            });
            content.appendChild(btn);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ── Card entry point ──────────────────────────────────────────────────────
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
                    var a = data.address || {};
                    var name = data.name ||
                        a.nature_reserve || a.forest || a.park ||
                        a.suburb || a.village || a.town ||
                        a.county || a.state_district || null;
                    resolve(name ? name.toUpperCase() : null);
                })
                .catch(function () { resolve(null); });
        });
    }

    // ── Tier helpers ──────────────────────────────────────────────────────────
    function displayName(t) {
        return (window.TIER_DISPLAY_NAMES || {})[t] || t || 'Unknown';
    }
    var TIER_ORDER = [
        'Tier 1 (Core Habitat)',
        'Tier 2 (Major Stepping Stones)',
        'Tier 3 (Connected Fragments)',
        'Tier 4 (Vulnerable Edge Fragments)',
        'Tier 5 (Isolated Fragments)',
        'Tier 6 (Isolated Micro Patches)'
    ];
    // Published short names for the spectrum bar
    var TIER_SHORT = [
        'PRIMARY','ESTABLISHED','FUNCTIONAL',
        'VULNERABLE','MARGINAL','REMNANT'
    ];
    var TIER_SEG_COLORS = [
        '#c8f090','#a0d060','#70a030',
        '#486820','#284010','#142008'
    ];
    function tIdx(t)  { var i = TIER_ORDER.indexOf(t); return i >= 0 ? i : -1; }

    // ── QR URL ────────────────────────────────────────────────────────────────
    function qrUrl(lat, lng) {
        var base = 'https://myforestconnect.online';
        if (lat && lng) {
            var pg = lng < 102.5 ? 'klang-valley-map.html' : 'kuantan-map.html';
            base = 'https://myforestconnect.online/' + pg +
                '#15.00/' + lat.toFixed(5) + '/' + lng.toFixed(5);
        }
        return 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' +
            encodeURIComponent(base) +
            '&bgcolor=0f380f&color=9bbc0f&margin=6';
    }

    // ── Draw patch shape ──────────────────────────────────────────────────────
    function drawShape(ctx, geometry, x, y, w, h, fill, stroke) {
        if (!geometry || !geometry.coordinates) return;
        var pts = [];
        if (geometry.type === 'Polygon') {
            geometry.coordinates[0].forEach(function (c) { pts.push(c); });
        } else if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach(function (p) {
                p[0].forEach(function (c) { pts.push(c); });
            });
        }
        if (!pts.length) return;
        var x0=pts[0][0],x1=pts[0][0],y0=pts[0][1],y1=pts[0][1];
        pts.forEach(function (c) {
            if(c[0]<x0)x0=c[0]; if(c[0]>x1)x1=c[0];
            if(c[1]<y0)y0=c[1]; if(c[1]>y1)y1=c[1];
        });
        var rx=x1-x0||0.0001, ry=y1-y0||0.0001;
        var sc=Math.min(w/rx, h/ry)*0.85;
        var ox=x+w/2-(x0+rx/2)*sc, oy=y+h/2+(y0+ry/2)*sc;
        function proj(c){ return [c[0]*sc+ox, -c[1]*sc+oy]; }
        function ring(pts2) {
            var p0=proj(pts2[0]); ctx.moveTo(p0[0],p0[1]);
            for(var i=1;i<pts2.length;i++){var pi=proj(pts2[i]);ctx.lineTo(pi[0],pi[1]);}
            ctx.closePath();
        }
        ctx.beginPath();
        if(geometry.type==='Polygon'){ ring(geometry.coordinates[0]); }
        else { geometry.coordinates.forEach(function(p){ring(p[0]);}); }
        ctx.fillStyle=fill; ctx.fill();
        ctx.beginPath();
        if(geometry.type==='Polygon'){ ring(geometry.coordinates[0]); }
        else { geometry.coordinates.forEach(function(p){ring(p[0]);}); }
        ctx.strokeStyle=stroke; ctx.lineWidth=2; ctx.stroke();
    }

    // ── Pixel corner decoration ────────────────────────────────────────────────
    function pixelCorners(ctx, x, y, w, h, size, color) {
        ctx.fillStyle = color;
        [[x,y],[x+w-size,y],[x,y+h-size],[x+w-size,y+h-size]].forEach(function (c) {
            ctx.fillRect(c[0], c[1], size, size);
        });
    }

    // ── Main render ───────────────────────────────────────────────────────────
    function renderCard(p, lat, lng, geometry, placeName) {
        var GB_DARK   = '#0f380f';
        var GB_MED    = '#306230';
        var GB_LIGHT  = '#8bac0f';
        var GB_BRIGHT = '#9bbc0f';
        var GB_WHITE  = '#e0f8d0';

        var tierInt  = p.Tier || '';
        var tierLbl  = displayName(tierInt).toUpperCase();
        var ti       = tIdx(tierInt);
        var conn     = (p.connectivity || 'No Data').toUpperCase();
        // Connectivity display colours (retro palette)
        var connClr  = conn==='HIGH' ? '#9bbc0f' : conn==='MODERATE' ? '#8bac0f' :
                       conn==='LOW'  ? '#306230' : conn==='BARRIER'  ? '#0f380f' : '#306230';
        var connBdr  = conn==='HIGH' ? GB_BRIGHT : GB_LIGHT;

        // ── Canvas: 800×620 at 2× ─────────────────────────────────────────────
        var W=800, H=620, SC=2;
        var cv=document.createElement('canvas');
        cv.width=W*SC; cv.height=H*SC;
        var ctx=cv.getContext('2d');
        ctx.scale(SC,SC);

        // Use Press Start 2P if loaded, else fallback monospace
        var F_BIG   = _fontLoaded ? '"Press Start 2P",monospace' : 'monospace';
        var F_SMALL = _fontLoaded ? '"Press Start 2P",monospace' : 'monospace';

        // ── Layout constants (must match Python preview exactly) ──────────────
        var PAD     = 20;
        var COL1_W  = 200;
        var COL2_X  = PAD + COL1_W + 16;
        var COL2_W  = W - COL2_X - PAD;
        var HDR_H   = 70;
        var PL_Y    = HDR_H + 8;
        var BDGE_Y  = PL_Y + 30;
        var SPEC_Y  = BDGE_Y + 60;   // spectrum bar
        var CONT_Y  = SPEC_Y + 36;   // content area starts
        var FOOT_Y  = H - 44;
        var AVAIL_H = FOOT_Y - CONT_Y;
        var SHAPE_H = 200;
        var QR_Y    = CONT_Y + SHAPE_H + 8;
        var QR_H    = FOOT_Y - QR_Y;
        var QR_SZ   = Math.min(QR_H - 30, COL1_W - 20);
        var mCOLS=2, mGAP=8;
        var mW      = Math.floor((COL2_W - mGAP) / mCOLS);
        var mH      = Math.floor((AVAIL_H - mGAP*2) / 3);

        // ── Background ────────────────────────────────────────────────────────
        ctx.fillStyle=GB_DARK; ctx.fillRect(0,0,W,H);

        // Grid lines
        ctx.strokeStyle=GB_MED; ctx.lineWidth=1;
        for(var gx=0;gx<W;gx+=16){
            ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke();
        }
        for(var gy=0;gy<H;gy+=16){
            ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();
        }

        // ── Outer border ──────────────────────────────────────────────────────
        ctx.strokeStyle=GB_BRIGHT; ctx.lineWidth=4;
        ctx.strokeRect(2,2,W-4,H-4);
        ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=2;
        ctx.strokeRect(7,7,W-14,H-14);

        // ── Header ────────────────────────────────────────────────────────────
        ctx.fillStyle=GB_MED; ctx.fillRect(4,4,W-8,HDR_H);
        ctx.fillStyle=GB_BRIGHT; ctx.fillRect(4,HDR_H,W-8,3);

        ctx.fillStyle=GB_BRIGHT;
        ctx.font='bold 12px '+F_BIG;
        ctx.fillText('> FOREST PATCH REPORT CARD', PAD, 24);
        ctx.fillStyle=GB_LIGHT;
        ctx.font='9px '+F_SMALL;
        ctx.fillText('MYFORESTCONNECT.ONLINE', PAD, 46);
        if(p.id!=null){
            ctx.fillStyle=GB_WHITE;
            ctx.font='9px '+F_SMALL;
            var idT='PATCH #'+p.id;
            ctx.fillText(idT, W-PAD-ctx.measureText(idT).width, 46);
        }

        // ── Place name strip ──────────────────────────────────────────────────
        ctx.fillStyle=GB_DARK; ctx.fillRect(PAD,PL_Y,W-PAD*2,22);
        ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=1;
        ctx.strokeRect(PAD,PL_Y,W-PAD*2,22);
        ctx.fillStyle=GB_BRIGHT; ctx.font='bold 8px '+F_BIG;
        var pname = placeName ? '[ '+placeName+' ]' : '[ LOCATION UNAVAILABLE ]';
        // Truncate
        while(ctx.measureText(pname).width > W-PAD*2-16 && pname.length>10)
            pname=pname.slice(0,-2)+'...]';
        ctx.fillText(pname, PAD+8, PL_Y+15);

        // ── Badge row ─────────────────────────────────────────────────────────
        // Tier
        ctx.fillStyle=GB_MED; ctx.fillRect(PAD,BDGE_Y,290,38);
        ctx.strokeStyle=GB_BRIGHT; ctx.lineWidth=2;
        ctx.strokeRect(PAD,BDGE_Y,290,38);
        ctx.fillStyle=GB_LIGHT; ctx.font='7px '+F_SMALL;
        ctx.fillText('TIER:', PAD+8, BDGE_Y+12);
        ctx.fillStyle=GB_BRIGHT; ctx.font='bold 9px '+F_BIG;
        ctx.fillText(tierLbl, PAD+8, BDGE_Y+28);

        // Connectivity
        var CX=PAD+302;
        ctx.fillStyle=connClr; ctx.fillRect(CX,BDGE_Y,170,38);
        ctx.strokeStyle=connBdr; ctx.lineWidth=2;
        ctx.strokeRect(CX,BDGE_Y,170,38);
        ctx.fillStyle=GB_LIGHT; ctx.font='7px '+F_SMALL;
        ctx.fillText('CONN:', CX+8, BDGE_Y+12);
        ctx.fillStyle=GB_BRIGHT; ctx.font='bold 9px '+F_BIG;
        ctx.fillText('[ '+conn+' ]', CX+8, BDGE_Y+28);

        // GPS
        var GX=CX+182;
        ctx.fillStyle=GB_DARK; ctx.fillRect(GX,BDGE_Y,W-GX-PAD,38);
        ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=1;
        ctx.strokeRect(GX,BDGE_Y,W-GX-PAD,38);
        ctx.fillStyle=GB_LIGHT; ctx.font='7px '+F_SMALL;
        ctx.fillText('GPS:', GX+8, BDGE_Y+12);
        ctx.fillStyle=GB_WHITE; ctx.font='7px '+F_SMALL;
        if(lat&&lng){
            ctx.fillText(lat.toFixed(5)+'N  '+lng.toFixed(5)+'E', GX+8, BDGE_Y+28);
        } else {
            ctx.fillText('UNAVAILABLE', GX+8, BDGE_Y+28);
        }

        // ── Tier spectrum bar ─────────────────────────────────────────────────
        ctx.fillStyle=GB_LIGHT; ctx.font='7px '+F_SMALL;
        ctx.fillText('QUALITY>>                              <<DEGRADED', PAD, SPEC_Y-2);

        var segW=(W-PAD*2)/6;
        for(var si=0;si<6;si++){
            var sx=PAD+si*segW;
            ctx.fillStyle=TIER_SEG_COLORS[si];
            ctx.fillRect(sx, SPEC_Y, segW, 20);
            if(si===ti){
                ctx.strokeStyle=GB_BRIGHT; ctx.lineWidth=3;
                ctx.strokeRect(sx+1, SPEC_Y+1, segW-2, 18);
            }
            ctx.fillStyle=si<2?GB_DARK:GB_BRIGHT;
            ctx.font='bold 7px '+F_BIG;
            var tl='T'+(si+1);
            ctx.fillText(tl, sx+segW/2-ctx.measureText(tl).width/2, SPEC_Y+13);
        }

        // Pixel pointer
        if(ti>=0){
            var ptrX=PAD+ti*segW+segW/2;
            ctx.fillStyle=GB_BRIGHT;
            ctx.beginPath();
            ctx.moveTo(ptrX-6,SPEC_Y+22);
            ctx.lineTo(ptrX+6,SPEC_Y+22);
            ctx.lineTo(ptrX,  SPEC_Y+30);
            ctx.closePath(); ctx.fill();
        }

        // ── Left: shape panel ─────────────────────────────────────────────────
        ctx.fillStyle=GB_DARK; ctx.fillRect(PAD,CONT_Y,COL1_W,SHAPE_H);
        ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=2;
        ctx.strokeRect(PAD,CONT_Y,COL1_W,SHAPE_H);
        pixelCorners(ctx,PAD,CONT_Y,COL1_W,SHAPE_H,8,GB_BRIGHT);

        ctx.fillStyle=GB_LIGHT; ctx.font='7px '+F_SMALL;
        ctx.fillText('[ PATCH SHAPE ]', PAD+12, CONT_Y+14);

        if(geometry){
            drawShape(ctx, geometry,
                PAD+10, CONT_Y+24, COL1_W-20, SHAPE_H-40,
                GB_MED, GB_BRIGHT);
        } else {
            ctx.fillStyle=GB_MED; ctx.font='7px '+F_SMALL;
            ctx.fillText('SHAPE', PAD+60, CONT_Y+SHAPE_H/2-4);
            ctx.fillText('UNAVAILABLE', PAD+36, CONT_Y+SHAPE_H/2+10);
        }
        ctx.fillStyle=GB_LIGHT; ctx.font='6px '+F_SMALL;
        ctx.fillText('PATCH GEOMETRY', PAD+22, CONT_Y+SHAPE_H-12);

        // ── Left: QR panel ────────────────────────────────────────────────────
        ctx.fillStyle=GB_DARK; ctx.fillRect(PAD,QR_Y,COL1_W,QR_H);
        ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=2;
        ctx.strokeRect(PAD,QR_Y,COL1_W,QR_H);
        pixelCorners(ctx,PAD,QR_Y,COL1_W,QR_H,8,GB_BRIGHT);

        ctx.fillStyle=GB_LIGHT; ctx.font='7px '+F_SMALL;
        ctx.fillText('[ SCAN ME ]', PAD+12, QR_Y+14);

        // ── Right: metrics ────────────────────────────────────────────────────
        ctx.fillStyle=GB_LIGHT; ctx.font='7px '+F_SMALL;
        ctx.fillText('[ METRICS ]', COL2_X, CONT_Y-6);

        var nv=function(v){return v!=null?parseFloat(v):null;};
        var mets=[
            {l:'TOTAL AREA',   v:nv(p.area)     !=null?nv(p.area).toFixed(2)     :'--', u:'HA'},
            {l:'CORE AREA',    v:nv(p.core)     !=null?nv(p.core).toFixed(2)     :'--', u:'HA'},
            {l:'CONTIGUITY',   v:nv(p.contig)   !=null?nv(p.contig).toFixed(3)   :'--', u:'0-1'},
            {l:'ENN DIST',     v:nv(p.enn)      !=null?Math.round(nv(p.enn))+''  :'--', u:'M'},
            {l:'PARA RATIO',   v:nv(p.para)     !=null?nv(p.para).toFixed(5)     :'--', u:''},
            {l:'MEAN FLOW',    v:nv(p.mean_flow)!=null?nv(p.mean_flow).toFixed(2):'--', u:''}
        ];

        mets.forEach(function(m,i){
            var col=i%mCOLS, row=Math.floor(i/mCOLS);
            var mx2=COL2_X+col*(mW+mGAP);
            var my2=CONT_Y+row*(mH+mGAP);

            ctx.fillStyle=GB_DARK; ctx.fillRect(mx2,my2,mW,mH);
            ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=1;
            ctx.strokeRect(mx2,my2,mW,mH);
            pixelCorners(ctx,mx2,my2,mW,mH,6,GB_MED);

            // Label
            ctx.fillStyle=GB_LIGHT; ctx.font='6px '+F_SMALL;
            ctx.fillText(m.l, mx2+8, my2+14);

            // Value — auto-size to fit
            var valFont=11;
            ctx.font='bold '+valFont+'px '+F_BIG;
            while(ctx.measureText(m.v).width>mW-16&&valFont>7){
                valFont--;
                ctx.font='bold '+valFont+'px '+F_BIG;
            }
            ctx.fillStyle=GB_BRIGHT;
            ctx.fillText(m.v, mx2+8, my2+mH/2+4);

            // Unit
            if(m.u){
                ctx.fillStyle=GB_MED; ctx.font='6px '+F_SMALL;
                ctx.fillText(m.u, mx2+8, my2+mH-10);
            }
        });

        // ── Footer ────────────────────────────────────────────────────────────
        ctx.fillStyle=GB_MED; ctx.fillRect(0,FOOT_Y,W,H-FOOT_Y);
        ctx.fillStyle=GB_BRIGHT; ctx.fillRect(0,FOOT_Y,W,3);
        ctx.fillStyle=GB_BRIGHT; ctx.font='bold 7px '+F_BIG;
        var dd=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}).toUpperCase();
        ctx.fillText('> GENERATED '+dd, PAD, FOOT_Y+22);
        ctx.fillStyle=GB_DARK; ctx.font='7px '+F_SMALL;
        var dis='FOR RESEARCH ONLY';
        ctx.fillText(dis, W-PAD-ctx.measureText(dis).width, FOOT_Y+22);

        // ── Load QR, then download ─────────────────────────────────────────────
        var qi=new Image(); qi.crossOrigin='anonymous';
        qi.onload=function(){
            var qx2=PAD+Math.floor((COL1_W-QR_SZ)/2);
            var qy2=QR_Y+20;
            ctx.drawImage(qi,qx2,qy2,QR_SZ,QR_SZ);
            // "Scan" label below if it fits
            var scanY=qy2+QR_SZ+8;
            if(scanY+10<QR_Y+QR_H){
                ctx.fillStyle=GB_LIGHT; ctx.font='6px '+F_SMALL;
                var sc3='OPEN IN PLATFORM';
                ctx.fillText(sc3, PAD+Math.floor((COL1_W-ctx.measureText(sc3).width)/2), scanY+8);
            }
            dl();
        };
        qi.onerror=function(){ dl(); };
        qi.src=qrUrl(lat,lng);

        function dl(){
            var a=document.createElement('a');
            a.download='patch_'+(p.id!=null?p.id:'report')+'_report_card.png';
            a.href=cv.toDataURL('image/png',1.0);
            a.click();
        }
    }

    // ── Pixel corner helper ────────────────────────────────────────────────────
    function pixelCorners(ctx,x,y,w,h,size,color){
        ctx.fillStyle=color;
        [[x,y],[x+w-size,y],[x,y+h-size],[x+w-size,y+h-size]].forEach(function(c){
            ctx.fillRect(c[0],c[1],size,size);
        });
    }

    // ── Boot ──────────────────────────────────────────────────────────────────
    if(document.readyState!=='loading'){initReportCards();}
    else{document.addEventListener('DOMContentLoaded',initReportCards);}

})();
