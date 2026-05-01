//   Add one line before <script src="config.js"> in each map HTML file:
//       <script src="features.js"></script>
// ─────────────────────────────────────────────────────────────────────────────

(function () {
    'use strict';

    // ── Load Press Start 2P font ──────────────────────────────────────────────
    (function () {
        var lnk = document.createElement('link');
        lnk.rel  = 'stylesheet';
        lnk.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
        document.head.appendChild(lnk);
    })();

    function F(size) { return size + 'px "Press Start 2P",monospace'; }

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

    // ── Forest name ─────────────────
    function fetchForestName(lat, lng) {
        return new Promise(function (resolve) {
            if (!lat || !lng) { resolve(null); return; }

            // Step 1: containing polygon
            var q1 = '[out:json][timeout:10];' +
                'is_in(' + lat + ',' + lng + ')->.a;' +
                '(' +
                '  way(pivot.a)["landuse"="forest"];' +
                '  relation(pivot.a)["landuse"="forest"];' +
                '  way(pivot.a)["leisure"="nature_reserve"];' +
                '  relation(pivot.a)["leisure"="nature_reserve"];' +
                '  way(pivot.a)["boundary"="protected_area"];' +
                '  relation(pivot.a)["boundary"="protected_area"];' +
                ');out tags;';

            overpass(q1)
                .then(function (data) {
                    var n = extractName(data);
                    if (n) { resolve(n); return Promise.resolve(null); }

                    // Step 2: nearby within 2 km
                    var q2 = '[out:json][timeout:10];(' +
                        '  way["landuse"="forest"](around:2000,' + lat + ',' + lng + ');' +
                        '  relation["landuse"="forest"](around:2000,' + lat + ',' + lng + ');' +
                        '  way["leisure"="nature_reserve"](around:2000,' + lat + ',' + lng + ');' +
                        '  relation["leisure"="nature_reserve"](around:2000,' + lat + ',' + lng + ');' +
                        '  way["boundary"="protected_area"](around:2000,' + lat + ',' + lng + ');' +
                        '  relation["boundary"="protected_area"](around:2000,' + lat + ',' + lng + ');' +
                        ');out tags;';
                    return overpass(q2);
                })
                .then(function (data) {
                    if (!data) return Promise.resolve(null);
                    var n = extractName(data);
                    if (n) { resolve(n); return Promise.resolve(null); }

                    // Step 3: Nominatim fallback
                    var url = 'https://nominatim.openstreetmap.org/reverse?lat=' + lat +
                        '&lon=' + lng + '&format=json&zoom=14&addressdetails=1';
                    return fetch(url, {
                        headers: { 'Accept-Language': 'en', 'User-Agent': 'myforestconnect.online' }
                    }).then(function (r) { return r.json(); })
                      .then(function (d) {
                          var a = d.address || {};
                          var nm = d.name || a.nature_reserve || a.forest ||
                                   a.park || a.suburb || a.village || a.town || null;
                          resolve(nm ? nm.toUpperCase() : null);
                      });
                })
                .catch(function () { resolve(null); });
        });
    }

    function overpass(q) {
        return fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q))
            .then(function (r) { return r.json(); })
            .catch(function () { return null; });
    }
    function extractName(data) {
        if (!data || !data.elements || !data.elements.length) return null;
        var el = data.elements.find(function (e) { return e.tags && e.tags.name; });
        return el ? el.tags.name.toUpperCase() : null;
    }

    // ── Tier helpers ──────────────────────────────────────────────────────────
    var TIER_ORDER = [
        'Tier 1 (Core Habitat)',
        'Tier 2 (Major Stepping Stones)',
        'Tier 3 (Connected Fragments)',
        'Tier 4 (Vulnerable Edge Fragments)',
        'Tier 5 (Isolated Fragments)',
        'Tier 6 (Isolated Micro Patches)'
    ];
    // Full published display names
    var TIER_PUBLISHED = {
        'Tier 1 (Core Habitat)':              'TIER 1 / PRIMARY FOREST',
        'Tier 2 (Major Stepping Stones)':     'TIER 2 / ESTABLISHED FOREST',
        'Tier 3 (Connected Fragments)':       'TIER 3 / FUNCTIONAL FRAGMENT',
        'Tier 4 (Vulnerable Edge Fragments)': 'TIER 4 / VULNERABLE FRAGMENT',
        'Tier 5 (Isolated Fragments)':        'TIER 5 / MARGINAL FRAGMENT',
        'Tier 6 (Isolated Micro Patches)':    'TIER 6 / REMNANT PATCH'
    };
    var TIER_CODE = ['TIER 1','TIER 2','TIER 3','TIER 4','TIER 5','TIER 6'];
    var TIER_SEG  = ['#c8f090','#a0d060','#70a030','#486820','#284010','#142008'];

    function displayName(t) {
        return TIER_PUBLISHED[t] ||
            ((window.TIER_DISPLAY_NAMES || {})[t] || t || 'UNKNOWN').toUpperCase();
    }
    function tIdx(t) { var i = TIER_ORDER.indexOf(t); return i >= 0 ? i : -1; }

    // ── QR URL ────────────────────────────────────────────────────────────────
    function qrUrl(lat, lng) {
        var base = 'https://myforestconnect.online';
        if (lat && lng) {
            var pg = lng < 102.5 ? 'klang-valley-map.html' : 'kuantan-map.html';
            base = 'https://myforestconnect.online/' + pg +
                '#15.00/' + lat.toFixed(5) + '/' + lng.toFixed(5);
        }
        return 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' +
            encodeURIComponent(base) + '&bgcolor=0f380f&color=9bbc0f&margin=8';
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
        function proj(c){return[c[0]*sc+ox,-c[1]*sc+oy];}
        function ring(pts2){
            var p0=proj(pts2[0]);ctx.moveTo(p0[0],p0[1]);
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

    // ── Pixel corners ─────────────────────────────────────────────────────────
    function pxC(ctx,x,y,w,h,sz,col){
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

        var tierInt = p.Tier || '';
        var tierLbl = displayName(tierInt);
        var ti      = tIdx(tierInt);
        var conn    = (p.connectivity || 'No Data').toUpperCase();

        // ── Canvas 800×700 @ 2× ───────────────────────────────────────────────
        var W=800, H=700, SC=2;
        var cv=document.createElement('canvas');
        cv.width=W*SC; cv.height=H*SC;
        var ctx=cv.getContext('2d');
        ctx.scale(SC,SC);

        // ── Layout constants — verified in Python preview ─────────────────────
        var PAD=20, COL1_W=210;
        var COL2_X=PAD+COL1_W+14, COL2_W=W-COL2_X-PAD;
        var HDR_H=84, PL_Y=HDR_H+8, BDGE_Y=PL_Y+32;
        var SPEC_Y=BDGE_Y+62, CONT_Y=SPEC_Y+38;
        var FOOT_Y=H-50, AVAIL=FOOT_Y-CONT_Y;
        var SHAPE_H=200, QR_Y=CONT_Y+SHAPE_H+10;
        var QR_H=FOOT_Y-QR_Y;
        var QR_SZ=Math.min(QR_H-36, COL1_W-24);
        var mCOLS=2, mGAP=10;
        var mW=Math.floor((COL2_W-mGAP)/mCOLS);
        var mH=Math.floor((AVAIL-mGAP*2)/3);

        // ── Background + grid ─────────────────────────────────────────────────
        ctx.fillStyle=GB_DARK; ctx.fillRect(0,0,W,H);
        ctx.strokeStyle=GB_MED; ctx.lineWidth=1;
        for(var gx=0;gx<W;gx+=16){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke();}
        for(var gy=0;gy<H;gy+=16){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();}

        // Border
        ctx.strokeStyle=GB_BRIGHT;ctx.lineWidth=4;ctx.strokeRect(2,2,W-4,H-4);
        ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=2;ctx.strokeRect(7,7,W-14,H-14);

        // ── Header ────────────────────────────────────────────────────────────
        ctx.fillStyle=GB_MED; ctx.fillRect(4,4,W-8,HDR_H);
        ctx.fillStyle=GB_BRIGHT; ctx.fillRect(4,HDR_H,W-8,3);
        ctx.fillStyle=GB_BRIGHT; ctx.font=F(14);
        ctx.fillText('> FOREST PATCH REPORT CARD',PAD,26);
        ctx.fillStyle=GB_LIGHT; ctx.font=F(10);
        ctx.fillText('MYFORESTCONNECT.ONLINE',PAD,54);
        if(p.id!=null){
            ctx.fillStyle=GB_WHITE; ctx.font=F(10);
            var idT='PATCH #'+p.id;
            ctx.fillText(idT, W-PAD-ctx.measureText(idT).width, 54);
        }

        // ── Forest name strip ─────────────────────────────────────────────────
        ctx.fillStyle=GB_DARK; ctx.fillRect(PAD,PL_Y,W-PAD*2,28);
        ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=1;
        ctx.strokeRect(PAD,PL_Y,W-PAD*2,28);
        var pn = forestName ? '[ '+forestName+' ]' : '[ LOCATION DATA UNAVAILABLE ]';
        ctx.fillStyle=GB_BRIGHT; ctx.font=F(10);
        // Truncate to fit
        while(ctx.measureText(pn).width > W-PAD*2-20 && pn.length>10)
            pn = pn.slice(0,-2)+'...]';
        ctx.fillText(pn, PAD+10, PL_Y+19);

        // ── Badge row ─────────────────────────────────────────────────────────
        // 1. Tier badge — auto-fit font size for full name
        ctx.fillStyle=GB_MED; ctx.fillRect(PAD,BDGE_Y,310,50);
        ctx.strokeStyle=GB_BRIGHT; ctx.lineWidth=2;
        ctx.strokeRect(PAD,BDGE_Y,310,50);
        ctx.fillStyle=GB_LIGHT; ctx.font=F(9);
        ctx.fillText('TIER', PAD+10, BDGE_Y+14);
        var tfs=10; ctx.font=F(tfs);
        while(ctx.measureText(tierLbl).width > 290 && tfs > 7){ tfs--; ctx.font=F(tfs); }
        ctx.fillStyle=GB_BRIGHT;
        ctx.fillText(tierLbl, PAD+10, BDGE_Y+34);

        // 2. Connectivity badge
        var CX=PAD+322;
        ctx.fillStyle=GB_DARK; ctx.fillRect(CX,BDGE_Y,170,50);
        ctx.strokeStyle=GB_BRIGHT; ctx.lineWidth=2;
        ctx.strokeRect(CX,BDGE_Y,170,50);
        ctx.fillStyle=GB_LIGHT; ctx.font=F(9);
        ctx.fillText('CONNECTIVITY', CX+10, BDGE_Y+14);
        ctx.fillStyle=GB_BRIGHT; ctx.font=F(11);
        ctx.fillText('[ '+conn+' ]', CX+10, BDGE_Y+34);

        // 3. GPS badge
        var GX=CX+182;
        ctx.fillStyle='#1a4a1a'; ctx.fillRect(GX,BDGE_Y,W-GX-PAD,50);
        ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=1;
        ctx.strokeRect(GX,BDGE_Y,W-GX-PAD,50);
        ctx.fillStyle=GB_LIGHT; ctx.font=F(9);
        ctx.fillText('LOCATION', GX+10, BDGE_Y+14);
        ctx.fillStyle=GB_WHITE; ctx.font=F(9);
        if(lat&&lng){
            ctx.fillText(lat.toFixed(5)+'N', GX+10, BDGE_Y+32);
            ctx.fillText(lng.toFixed(5)+'E', GX+10+Math.floor((W-GX-PAD)/2), BDGE_Y+32);
        } else {
            ctx.fillText('UNAVAILABLE', GX+10, BDGE_Y+32);
        }

        // ── Tier spectrum bar ─────────────────────────────────────────────────
        var segW=Math.floor((W-PAD*2)/6);
        for(var si=0;si<6;si++){
            var sx=PAD+si*segW;
            ctx.fillStyle=TIER_SEG[si]; ctx.fillRect(sx,SPEC_Y,segW,24);
            if(si===ti){
                ctx.strokeStyle=GB_BRIGHT; ctx.lineWidth=3;
                ctx.strokeRect(sx+1,SPEC_Y+1,segW-2,22);
            }
            ctx.fillStyle=si<2?GB_DARK:GB_BRIGHT; ctx.font=F(8);
            var tc=TIER_CODE[si];
            ctx.fillText(tc, sx+segW/2-ctx.measureText(tc).width/2, SPEC_Y+15);
        }
        if(ti>=0){
            var ptrX=PAD+ti*segW+segW/2;
            ctx.fillStyle=GB_BRIGHT;
            ctx.beginPath();
            ctx.moveTo(ptrX-8,SPEC_Y+26); ctx.lineTo(ptrX+8,SPEC_Y+26);
            ctx.lineTo(ptrX,SPEC_Y+36); ctx.closePath(); ctx.fill();
        }

        // ── Left: shape panel ─────────────────────────────────────────────────
        ctx.fillStyle=GB_DARK; ctx.fillRect(PAD,CONT_Y,COL1_W,SHAPE_H);
        ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=2;
        ctx.strokeRect(PAD,CONT_Y,COL1_W,SHAPE_H);
        pxC(ctx,PAD,CONT_Y,COL1_W,SHAPE_H,8,GB_BRIGHT);
        ctx.fillStyle=GB_LIGHT; ctx.font=F(9);
        ctx.fillText('[ SHAPE ]',PAD+12,CONT_Y+18);
        if(geometry){
            drawShape(ctx,geometry,PAD+10,CONT_Y+28,COL1_W-20,SHAPE_H-40,GB_MED,GB_BRIGHT);
        } else {
            ctx.fillStyle=GB_MED; ctx.font=F(9);
            ctx.fillText('N/A',PAD+80,CONT_Y+SHAPE_H/2);
        }

        // ── Left: QR panel ────────────────────────────────────────────────────
        ctx.fillStyle=GB_DARK; ctx.fillRect(PAD,QR_Y,COL1_W,QR_H);
        ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=2;
        ctx.strokeRect(PAD,QR_Y,COL1_W,QR_H);
        pxC(ctx,PAD,QR_Y,COL1_W,QR_H,8,GB_BRIGHT);
        ctx.fillStyle=GB_LIGHT; ctx.font=F(9);
        ctx.fillText('[ SCAN TO OPEN IN PLATFORM ]',PAD+12,QR_Y+18);

        // ── Right: metric cards — no section title ────────────────────────────
        var nv=function(v){return v!=null?parseFloat(v):null;};
        var mets=[
            {l:'TOTAL AREA',  v:nv(p.area)     !=null?nv(p.area).toFixed(2)     :'--', u:'HA'},
            {l:'CORE AREA',   v:nv(p.core)     !=null?nv(p.core).toFixed(2)     :'--', u:'HA'},
            {l:'CONTIGUITY',  v:nv(p.contig)   !=null?nv(p.contig).toFixed(3)   :'--', u:'0-1'},
            {l:'ENN DIST',    v:nv(p.enn)      !=null?Math.round(nv(p.enn))+''  :'--', u:'M'},
            {l:'PARA RATIO',  v:nv(p.para)     !=null?nv(p.para).toFixed(5)     :'--', u:''},
            {l:'MEAN FLOW',   v:nv(p.mean_flow)!=null?nv(p.mean_flow).toFixed(2):'--', u:''}
        ];

        mets.forEach(function(m,i){
            var col=i%mCOLS, row=Math.floor(i/mCOLS);
            var mx=COL2_X+col*(mW+mGAP);
            var my=CONT_Y+row*(mH+mGAP);

            ctx.fillStyle=GB_DARK; ctx.fillRect(mx,my,mW,mH);
            ctx.strokeStyle=GB_LIGHT; ctx.lineWidth=1;
            ctx.strokeRect(mx,my,mW,mH);
            pxC(ctx,mx,my,mW,mH,6,GB_MED);

            // Label
            ctx.fillStyle=GB_LIGHT; ctx.font=F(9);
            ctx.fillText(m.l, mx+10, my+18);

            // Value — auto-fit font size
            var vfs=16; ctx.font=F(vfs);
            while(ctx.measureText(m.v).width > mW-20 && vfs>9){
                vfs--; ctx.font=F(vfs);
            }
            ctx.fillStyle=GB_BRIGHT;
            ctx.fillText(m.v, mx+10, my+Math.floor(mH/2)+10);

            // Unit — bright white, large and readable
            if(m.u){
                ctx.fillStyle=GB_WHITE; ctx.font=F(11);
                ctx.fillText(m.u, mx+10, my+mH-14);
            }
        });

        // ── Footer ────────────────────────────────────────────────────────────
        function drawFooter(){
            ctx.fillStyle=GB_MED; ctx.fillRect(0,FOOT_Y,W,H-FOOT_Y);
            ctx.fillStyle=GB_BRIGHT; ctx.fillRect(0,FOOT_Y,W,3);
            ctx.fillStyle=GB_BRIGHT; ctx.font=F(9);
            var dd=new Date().toLocaleDateString('en-GB',{
                day:'numeric',month:'long',year:'numeric'
            }).toUpperCase();
            ctx.fillText('> GENERATED '+dd, PAD, FOOT_Y+22);
            ctx.fillStyle=GB_DARK; ctx.font=F(9);
            var dis='FOR REFERENCE ONLY';
            ctx.fillText(dis, W-PAD-ctx.measureText(dis).width, FOOT_Y+22);
        }

        // ── Load QR then download ─────────────────────────────────────────────
        var qi=new Image(); qi.crossOrigin='anonymous';
        qi.onload=function(){
            var qx=PAD+Math.floor((COL1_W-QR_SZ)/2);
            var qy=QR_Y+26;
            ctx.drawImage(qi,qx,qy,QR_SZ,QR_SZ);
            var scY=qy+QR_SZ+8;
            if(scY+14 < QR_Y+QR_H){
                ctx.fillStyle=GB_LIGHT; ctx.font=F(8);
                var st='OPEN IN PLATFORM';
                ctx.fillText(st, PAD+Math.floor((COL1_W-ctx.measureText(st).width)/2), scY+10);
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
    if(document.readyState!=='loading'){ initReportCards(); }
    else { document.addEventListener('DOMContentLoaded', initReportCards); }

})();
