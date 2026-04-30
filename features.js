// features.js — myforestconnect retro report cards v3
//
// HOW TO USE:
//   Add ONE line before <script src="config.js"> in each map HTML file:
//       <script src="features.js"></script>
//   Remove that line to revert completely.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
    'use strict';

    // ── Load Press Start 2P font ──────────────────────────────────────────────
    var _fontReady = false;
    (function () {
        var lnk = document.createElement('link');
        lnk.rel  = 'preconnect';
        lnk.href = 'https://fonts.googleapis.com';
        document.head.appendChild(lnk);
        var lnk2 = document.createElement('link');
        lnk2.rel  = 'stylesheet';
        lnk2.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
        document.head.appendChild(lnk2);
        // Allow up to 3s to load; fall back to monospace gracefully
        setTimeout(function () { _fontReady = true; }, 3000);
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function () { _fontReady = true; });
        }
    })();

    function F(size) {
        return size + 'px "Press Start 2P", monospace';
    }

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
            fetchForestName(lat, lng).then(function (name) {
                renderCard(p, lat, lng, geometry, name);
                resolve();
            });
        });
    }

    // ── Overpass API — fetch containing forest/reserve name ───────────────────
    function fetchForestName(lat, lng) {
        return new Promise(function (resolve) {
            if (!lat || !lng) { resolve(null); return; }
            var query =
                '[out:json][timeout:10];' +
                'is_in(' + lat + ',' + lng + ')->.a;' +
                '(' +
                '  way(pivot.a)["landuse"="forest"];' +
                '  relation(pivot.a)["landuse"="forest"];' +
                '  way(pivot.a)["leisure"="nature_reserve"];' +
                '  relation(pivot.a)["leisure"="nature_reserve"];' +
                '  way(pivot.a)["boundary"="protected_area"];' +
                '  relation(pivot.a)["boundary"="protected_area"];' +
                '  way(pivot.a)["landuse"="conservation"];' +
                '  relation(pivot.a)["landuse"="conservation"];' +
                ');' +
                'out tags;';

            var url = 'https://overpass-api.de/api/interpreter?data=' +
                encodeURIComponent(query);

            fetch(url)
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (!data.elements || !data.elements.length) {
                        resolve(null); return;
                    }
                    // Prefer elements with a name tag; pick the first named one
                    var named = data.elements.find(function (el) {
                        return el.tags && el.tags.name;
                    });
                    if (named) {
                        resolve(named.tags.name.toUpperCase());
                    } else {
                        resolve(null);
                    }
                })
                .catch(function () { resolve(null); });
        });
    }

    // ── Tier helpers ──────────────────────────────────────────────────────────
    // Published display names (new names shown in UI)
    var TIER_DISPLAY = {
        'Tier 1 (Core Habitat)':              'Tier 1 (Primary forest)',
        'Tier 2 (Major Stepping Stones)':     'Tier 2 (Established forest)',
        'Tier 3 (Connected Fragments)':       'Tier 3 (Functional fragment)',
        'Tier 4 (Vulnerable Edge Fragments)': 'Tier 4 (Vulnerable fragment)',
        'Tier 5 (Isolated Fragments)':        'Tier 5 (Marginal fragment)',
        'Tier 6 (Isolated Micro Patches)':    'Tier 6 (Remnant patch)'
    };
    function displayName(t) {
        // Use platform TIER_DISPLAY_NAMES if available, else our local map
        var d = (window.TIER_DISPLAY_NAMES || {})[t] || TIER_DISPLAY[t] || t || 'Unknown';
        return d;
    }

    var TIER_ORDER = [
        'Tier 1 (Core Habitat)',
        'Tier 2 (Major Stepping Stones)',
        'Tier 3 (Connected Fragments)',
        'Tier 4 (Vulnerable Edge Fragments)',
        'Tier 5 (Isolated Fragments)',
        'Tier 6 (Isolated Micro Patches)'
    ];
    // 3-letter codes for spectrum bar segments
    var TIER_CODE = ['PRI','EST','FUN','VUL','MAR','REM'];
    var TIER_SEG  = ['#c8f090','#a0d060','#70a030','#486820','#284010','#142008'];

    function tIdx(t) { var i = TIER_ORDER.indexOf(t); return i >= 0 ? i : -1; }

    // ── QR URL ────────────────────────────────────────────────────────────────
    function qrUrl(lat, lng) {
        var base = 'https://myforestconnect.online';
        if (lat && lng) {
            var pg = lng < 102.5 ? 'klang-valley-map.html' : 'kuantan-map.html';
            base = 'https://myforestconnect.online/' + pg +
                '#15.00/' + lat.toFixed(5) + '/' + lng.toFixed(5);
        }
        return 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' +
            encodeURIComponent(base) +
            '&bgcolor=0f380f&color=9bbc0f&margin=8';
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
        var sc=Math.min(w/rx,h/ry)*0.85;
        var ox=x+w/2-(x0+rx/2)*sc, oy=y+h/2+(y0+ry/2)*sc;
        function proj(c){ return [c[0]*sc+ox,-c[1]*sc+oy]; }
        function ring(pts2){
            var p0=proj(pts2[0]); ctx.moveTo(p0[0],p0[1]);
            for(var i=1;i<pts2.length;i++){var pi=proj(pts2[i]);ctx.lineTo(pi[0],pi[1]);}
            ctx.closePath();
        }
        ctx.beginPath();
        if(geometry.type==='Polygon'){ring(geometry.coordinates[0]);}
        else{geometry.coordinates.forEach(function(p){ring(p[0]);});}
        ctx.fillStyle=fill; ctx.fill();
        ctx.beginPath();
        if(geometry.type==='Polygon'){ring(geometry.coordinates[0]);}
        else{geometry.coordinates.forEach(function(p){ring(p[0]);});}
        ctx.strokeStyle=stroke; ctx.lineWidth=2; ctx.stroke();
    }

    // ── Pixel corner decoration ────────────────────────────────────────────────
    function pixCorners(ctx,x,y,w,h,sz,col){
        ctx.fillStyle=col;
        [[x,y],[x+w-sz,y],[x,y+h-sz],[x+w-sz,y+h-sz]].forEach(function(c){
            ctx.fillRect(c[0],c[1],sz,sz);
        });
    }

    // ── Render card ───────────────────────────────────────────────────────────
    function renderCard(p, lat, lng, geometry, forestName) {

        var GB_DARK   = '#0f380f';
        var GB_MED    = '#306230';
        var GB_LIGHT  = '#8bac0f';
        var GB_BRIGHT = '#9bbc0f';
        var GB_WHITE  = '#e0f8d0';

        var tierInt  = p.Tier || '';
        var tierLbl  = displayName(tierInt).toUpperCase();
        // Build short tier display: "T2 / ESTABLISHED FOREST"
        var ti       = tIdx(tierInt);
        var tierShort = ti >= 0
            ? 'T'+(ti+1)+' / '+TIER_CODE[ti]+' FOREST'
            : tierLbl;
        var conn     = (p.connectivity || 'No Data').toUpperCase();

        // ── Canvas: 800×660 at 2× retina ─────────────────────────────────────
        var W=800, H=660, SC=2;
        var cv=document.createElement('canvas');
        cv.width=W*SC; cv.height=H*SC;
        var ctx=cv.getContext('2d');
        ctx.scale(SC,SC);

        // ── Layout constants (verified against Python preview) ────────────────
        var PAD=20, COL1_W=210;
        var COL2_X=PAD+COL1_W+14, COL2_W=W-COL2_X-PAD;
        var HDR_H=80, PL_Y=HDR_H+8, BDGE_Y=PL_Y+30;
        var SPEC_Y=BDGE_Y+56, CONT_Y=SPEC_Y+34;
        var FOOT_Y=H-48, AVAIL_H=FOOT_Y-CONT_Y;
        var SHAPE_H=200, QR_Y=CONT_Y+SHAPE_H+10;
        var QR_H=FOOT_Y-QR_Y;
        var QR_SZ=Math.min(QR_H-34, COL1_W-24);
        var mCOLS=2, mGAP=10;
        var mW=Math.floor((COL2_W-mGAP)/mCOLS);
        var mH=Math.floor((AVAIL_H-mGAP*2)/3);

        // ── Background + grid ─────────────────────────────────────────────────
        ctx.fillStyle=GB_DARK; ctx.fillRect(0,0,W,H);
        ctx.strokeStyle=GB_MED; ctx.lineWidth=1;
        for(var gx=0;gx<W;gx+=16){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke();}
        for(var gy=0;gy<H;gy+=16){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();}

        // ── Outer border ──────────────────────────────────────────────────────
        ctx.strokeStyle=GB_BRIGHT;ctx.lineWidth=4;ctx.strokeRect(2,2,W-4,H-4);
        ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=2;ctx.strokeRect(7,7,W-14,H-14);

        // ── Header ────────────────────────────────────────────────────────────
        ctx.fillStyle=GB_MED; ctx.fillRect(4,4,W-8,HDR_H);
        ctx.fillStyle=GB_BRIGHT; ctx.fillRect(4,HDR_H,W-8,3);
        ctx.fillStyle=GB_BRIGHT; ctx.font=F(13);
        ctx.fillText('> FOREST PATCH REPORT CARD',PAD,24);
        ctx.fillStyle=GB_LIGHT; ctx.font=F(9);
        ctx.fillText('MYFORESTCONNECT.ONLINE',PAD,48);
        if(p.id!=null){
            ctx.fillStyle=GB_WHITE; ctx.font=F(9);
            var idT='PATCH #'+p.id;
            ctx.fillText(idT, W-PAD-ctx.measureText(idT).width, 48);
        }

        // ── Forest name strip ─────────────────────────────────────────────────
        ctx.fillStyle=GB_DARK; ctx.fillRect(PAD,PL_Y,W-PAD*2,26);
        ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=1;
        ctx.strokeRect(PAD,PL_Y,W-PAD*2,26);
        ctx.fillStyle=GB_BRIGHT; ctx.font=F(9);
        var pn = forestName ? '[ '+forestName+' ]' : '[ FOREST NAME UNAVAILABLE ]';
        // Truncate if too wide
        while(ctx.measureText(pn).width > W-PAD*2-20 && pn.length > 10)
            pn = pn.slice(0,-2)+'...]';
        ctx.fillText(pn, PAD+8, PL_Y+18);

        // ── Badge row ─────────────────────────────────────────────────────────
        // 1 — Tier: bright border, medium bg
        ctx.fillStyle=GB_MED; ctx.fillRect(PAD,BDGE_Y,280,44);
        ctx.strokeStyle=GB_BRIGHT; ctx.lineWidth=2;
        ctx.strokeRect(PAD,BDGE_Y,280,44);
        ctx.fillStyle=GB_LIGHT; ctx.font=F(8);
        ctx.fillText('TIER', PAD+10, BDGE_Y+14);
        ctx.fillStyle=GB_BRIGHT; ctx.font=F(10);
        ctx.fillText(tierShort, PAD+10, BDGE_Y+32);

        // 2 — Connectivity: dark bg, bright text — avoids colour clash
        var CX=PAD+292;
        ctx.fillStyle=GB_DARK; ctx.fillRect(CX,BDGE_Y,164,44);
        ctx.strokeStyle=GB_BRIGHT; ctx.lineWidth=2;
        ctx.strokeRect(CX,BDGE_Y,164,44);
        ctx.fillStyle=GB_LIGHT; ctx.font=F(8);
        ctx.fillText('CONNECTIVITY', CX+10, BDGE_Y+14);
        ctx.fillStyle=GB_BRIGHT; ctx.font=F(10);
        ctx.fillText('[ '+conn+' ]', CX+10, BDGE_Y+32);

        // 3 — GPS: slightly lighter dark bg, white text
        var GX=CX+176;
        ctx.fillStyle='#1a4a1a'; ctx.fillRect(GX,BDGE_Y,W-GX-PAD,44);
        ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=1;
        ctx.strokeRect(GX,BDGE_Y,W-GX-PAD,44);
        ctx.fillStyle=GB_LIGHT; ctx.font=F(8);
        ctx.fillText('LOCATION', GX+10, BDGE_Y+14);
        ctx.fillStyle=GB_WHITE; ctx.font=F(8);
        if(lat&&lng){
            ctx.fillText(lat.toFixed(5)+'N', GX+10, BDGE_Y+30);
            ctx.fillText(lng.toFixed(5)+'E', GX+10+Math.floor((W-GX-PAD)/2), BDGE_Y+30);
        } else {
            ctx.fillText('UNAVAILABLE', GX+10, BDGE_Y+30);
        }

        // ── Tier spectrum bar ─────────────────────────────────────────────────
        var segW=Math.floor((W-PAD*2)/6);
        for(var si=0;si<6;si++){
            var sx=PAD+si*segW;
            ctx.fillStyle=TIER_SEG[si];
            ctx.fillRect(sx,SPEC_Y,segW,22);
            if(si===ti){
                ctx.strokeStyle=GB_BRIGHT; ctx.lineWidth=3;
                ctx.strokeRect(sx+1,SPEC_Y+1,segW-2,20);
            }
            ctx.fillStyle=si<2?GB_DARK:GB_BRIGHT;
            ctx.font=F(7);
            var tc=TIER_CODE[si];
            ctx.fillText(tc, sx+segW/2-ctx.measureText(tc).width/2, SPEC_Y+14);
        }
        // Pixel triangle pointer under active tier
        if(ti>=0){
            var ptrX=PAD+ti*segW+segW/2;
            ctx.fillStyle=GB_BRIGHT;
            ctx.beginPath();
            ctx.moveTo(ptrX-7,SPEC_Y+24);
            ctx.lineTo(ptrX+7,SPEC_Y+24);
            ctx.lineTo(ptrX,  SPEC_Y+33);
            ctx.closePath(); ctx.fill();
        }

        // ── Left: shape panel ─────────────────────────────────────────────────
        ctx.fillStyle=GB_DARK; ctx.fillRect(PAD,CONT_Y,COL1_W,SHAPE_H);
        ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=2;
        ctx.strokeRect(PAD,CONT_Y,COL1_W,SHAPE_H);
        pixCorners(ctx,PAD,CONT_Y,COL1_W,SHAPE_H,8,GB_BRIGHT);
        ctx.fillStyle=GB_LIGHT; ctx.font=F(8);
        ctx.fillText('[ PATCH SHAPE ]',PAD+12,CONT_Y+16);

        if(geometry){
            drawShape(ctx,geometry,
                PAD+10,CONT_Y+26,COL1_W-20,SHAPE_H-42,
                GB_MED, GB_BRIGHT);
        } else {
            ctx.fillStyle=GB_MED; ctx.font=F(8);
            ctx.fillText('SHAPE', PAD+55, CONT_Y+SHAPE_H/2-8);
            ctx.fillText('N/A',   PAD+68, CONT_Y+SHAPE_H/2+10);
        }
        ctx.fillStyle=GB_LIGHT; ctx.font=F(7);
        ctx.fillText('PATCH GEOMETRY', PAD+14, CONT_Y+SHAPE_H-14);

        // ── Left: QR panel ────────────────────────────────────────────────────
        ctx.fillStyle=GB_DARK; ctx.fillRect(PAD,QR_Y,COL1_W,QR_H);
        ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=2;
        ctx.strokeRect(PAD,QR_Y,COL1_W,QR_H);
        pixCorners(ctx,PAD,QR_Y,COL1_W,QR_H,8,GB_BRIGHT);
        ctx.fillStyle=GB_LIGHT; ctx.font=F(8);
        ctx.fillText('[ SCAN ME ]',PAD+12,QR_Y+16);

        // ── Right: metrics ────────────────────────────────────────────────────
        ctx.fillStyle=GB_LIGHT; ctx.font=F(8);
        ctx.fillText('[ METRICS ]',COL2_X,CONT_Y-8);

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
            var mx=COL2_X+col*(mW+mGAP);
            var my=CONT_Y+row*(mH+mGAP);

            ctx.fillStyle=GB_DARK; ctx.fillRect(mx,my,mW,mH);
            ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=1;
            ctx.strokeRect(mx,my,mW,mH);
            pixCorners(ctx,mx,my,mW,mH,6,GB_MED);

            // Label
            ctx.fillStyle=GB_LIGHT; ctx.font=F(8);
            ctx.fillText(m.l, mx+10, my+18);

            // Value — auto-fit font size
            var vfs=14;
            ctx.font=F(vfs);
            while(ctx.measureText(m.v).width>mW-20 && vfs>8){
                vfs--; ctx.font=F(vfs);
            }
            ctx.fillStyle=GB_BRIGHT;
            ctx.fillText(m.v, mx+10, my+Math.floor(mH/2)+8);

            // Unit
            if(m.u){
                ctx.fillStyle=GB_MED; ctx.font=F(8);
                ctx.fillText(m.u, mx+10, my+mH-14);
            }
        });

        // ── Footer ────────────────────────────────────────────────────────────
        function drawFooter(){
            ctx.fillStyle=GB_MED; ctx.fillRect(0,FOOT_Y,W,H-FOOT_Y);
            ctx.fillStyle=GB_BRIGHT; ctx.fillRect(0,FOOT_Y,W,3);
            ctx.fillStyle=GB_BRIGHT; ctx.font=F(8);
            var dd=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}).toUpperCase();
            ctx.fillText('> GENERATED '+dd, PAD, FOOT_Y+22);
            ctx.fillStyle=GB_DARK; ctx.font=F(8);
            var dis='FOR RESEARCH ONLY';
            ctx.fillText(dis, W-PAD-ctx.measureText(dis).width, FOOT_Y+22);
        }

        // ── Load QR then finalise ─────────────────────────────────────────────
        var qi=new Image(); qi.crossOrigin='anonymous';
        qi.onload=function(){
            var qx=PAD+Math.floor((COL1_W-QR_SZ)/2);
            var qy=QR_Y+22;
            ctx.drawImage(qi,qx,qy,QR_SZ,QR_SZ);
            var scanY=qy+QR_SZ+8;
            if(scanY+14<QR_Y+QR_H){
                ctx.fillStyle=GB_LIGHT; ctx.font=F(7);
                var st='OPEN IN PLATFORM';
                ctx.fillText(st, PAD+Math.floor((COL1_W-ctx.measureText(st).width)/2), scanY+10);
            }
            drawFooter(); dl();
        };
        qi.onerror=function(){ drawFooter(); dl(); };
        qi.src=qrUrl(lat,lng);

        function dl(){
            var a=document.createElement('a');
            a.download='patch_'+(p.id!=null?p.id:'report')+'_report_card.png';
            a.href=cv.toDataURL('image/png',1.0);
            a.click();
        }
    }

    // ── Boot ──────────────────────────────────────────────────────────────────
    if(document.readyState!=='loading'){initReportCards();}
    else{document.addEventListener('DOMContentLoaded',initReportCards);}

})();
