//   I prepared this script to test out new features abd stuff Just need to add one line before <script src="config.js"> in each map HTML file:
//       <script src="features.js"></script>
// ─────────────────────────────────────────────────────────────────────────────

(function () {
    'use strict';

    (function () {
        var lnk = document.createElement('link');
        lnk.rel  = 'stylesheet';
        lnk.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
        document.head.appendChild(lnk);
    })();

    function F(size) { return size + 'px "Press Start 2P",monospace'; }

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
            btn.textContent = '\u2b07 Download report card';
            btn.style.cssText =
                'display:block;width:100%;margin-top:18px;padding:8px 10px;' +
                'background:#2a8234;color:white;border:none;border-radius:4px;' +
                'font-size:12px;font-weight:600;cursor:pointer;' +
                'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
                'transition:background 0.15s;';
            btn.addEventListener('mouseover', function () { btn.style.background = '#1e6b27'; });
            btn.addEventListener('mouseout',  function () { btn.style.background = '#2a8234'; });
            btn.addEventListener('click', function () {
                btn.textContent = '\u23f3 Generating\u2026';
                btn.disabled = true;
                generateCard(window._lastPatchProps, window._lastPatchLngLat, window._lastPatchGeometry)
                    .then(function () { btn.textContent = '\u2b07 Download report card'; btn.disabled = false; })
                    .catch(function () { btn.textContent = '\u2b07 Download report card'; btn.disabled = false; });
            });
            content.appendChild(btn);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function generateCard(p, lngLat, geometry) {
        return new Promise(function (resolve) {
            var lat = lngLat ? lngLat.lat : null;
            var lng = lngLat ? lngLat.lng : null;
            fetchForestName(lat, lng).then(function (name) { renderCard(p, lat, lng, geometry, name); resolve(); });
        });
    }

    function fetchForestName(lat, lng) {
        return new Promise(function (resolve) {
            if (!lat || !lng) { resolve(null); return; }
            var q1 = '[out:json][timeout:10];is_in(' + lat + ',' + lng + ')->.a;(' +
                'way(pivot.a)["landuse"="forest"];relation(pivot.a)["landuse"="forest"];' +
                'way(pivot.a)["leisure"="nature_reserve"];relation(pivot.a)["leisure"="nature_reserve"];' +
                'way(pivot.a)["boundary"="protected_area"];relation(pivot.a)["boundary"="protected_area"];' +
                ');out tags;';
            overpass(q1).then(function (data) {
                var n = extractName(data);
                if (n) { resolve(n); return Promise.resolve(null); }
                var q2 = '[out:json][timeout:10];(' +
                    'way["landuse"="forest"](around:2000,' + lat + ',' + lng + ');' +
                    'relation["landuse"="forest"](around:2000,' + lat + ',' + lng + ');' +
                    'way["leisure"="nature_reserve"](around:2000,' + lat + ',' + lng + ');' +
                    'relation["leisure"="nature_reserve"](around:2000,' + lat + ',' + lng + ');' +
                    'way["boundary"="protected_area"](around:2000,' + lat + ',' + lng + ');' +
                    'relation["boundary"="protected_area"](around:2000,' + lat + ',' + lng + ');' +
                    ');out tags;';
                return overpass(q2);
            }).then(function (data) {
                if (!data) return Promise.resolve(null);
                var n = extractName(data);
                if (n) { resolve(n); return Promise.resolve(null); }
                return fetch('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json&zoom=14&addressdetails=1',
                    { headers: { 'Accept-Language': 'en', 'User-Agent': 'myforestconnect.online' } })
                    .then(function (r) { return r.json(); })
                    .then(function (d) {
                        var a = d.address || {};
                        var nm = d.name || a.nature_reserve || a.forest || a.park || a.suburb || a.village || a.town || null;
                        resolve(nm ? nm.toUpperCase() : null);
                    });
            }).catch(function () { resolve(null); });
        });
    }

    function overpass(q) {
        return fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q))
            .then(function (r) { return r.json(); }).catch(function () { return null; });
    }
    function extractName(data) {
        if (!data || !data.elements || !data.elements.length) return null;
        var el = data.elements.find(function (e) { return e.tags && e.tags.name; });
        return el ? el.tags.name.toUpperCase() : null;
    }

    var TIER_ORDER = [
        'Tier 1 (Core Habitat)','Tier 2 (Major Stepping Stones)','Tier 3 (Connected Fragments)',
        'Tier 4 (Vulnerable Edge Fragments)','Tier 5 (Isolated Fragments)','Tier 6 (Isolated Micro Patches)'
    ];
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
    var TIER_TEXT = ['#0f380f','#0f380f','#0f380f','#9bbc0f','#9bbc0f','#9bbc0f'];

    function displayName(t) {
        return TIER_PUBLISHED[t] || ((window.TIER_DISPLAY_NAMES || {})[t] || t || 'UNKNOWN').toUpperCase();
    }
    function tIdx(t) { var i = TIER_ORDER.indexOf(t); return i >= 0 ? i : -1; }

    function qrUrl(lat, lng) {
        var base = 'https://myforestconnect.online';
        if (lat && lng) {
            var pg = lng < 102.5 ? 'klang-valley-map.html' : 'kuantan-map.html';
            base = 'https://myforestconnect.online/' + pg + '#15.00/' + lat.toFixed(5) + '/' + lng.toFixed(5);
        }
        return 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(base) + '&bgcolor=0f380f&color=9bbc0f&margin=8';
    }

    function drawShape(ctx, geometry, x, y, w, h, fill, stroke) {
        if (!geometry || !geometry.coordinates) return;
        var pts = [];
        if (geometry.type === 'Polygon') { geometry.coordinates[0].forEach(function (c) { pts.push(c); }); }
        else if (geometry.type === 'MultiPolygon') { geometry.coordinates.forEach(function (p) { p[0].forEach(function (c) { pts.push(c); }); }); }
        if (!pts.length) return;
        var x0=pts[0][0],x1=pts[0][0],y0=pts[0][1],y1=pts[0][1];
        pts.forEach(function (c) { if(c[0]<x0)x0=c[0];if(c[0]>x1)x1=c[0];if(c[1]<y0)y0=c[1];if(c[1]>y1)y1=c[1]; });
        var rx=x1-x0||0.0001,ry=y1-y0||0.0001,sc=Math.min(w/rx,h/ry)*0.85;
        var ox=x+w/2-(x0+rx/2)*sc,oy=y+h/2+(y0+ry/2)*sc;
        function proj(c){return[c[0]*sc+ox,-c[1]*sc+oy];}
        function ring(pts2){var p0=proj(pts2[0]);ctx.moveTo(p0[0],p0[1]);for(var i=1;i<pts2.length;i++){var pi=proj(pts2[i]);ctx.lineTo(pi[0],pi[1]);}ctx.closePath();}
        ctx.beginPath();
        if(geometry.type==='Polygon'){ring(geometry.coordinates[0]);}else{geometry.coordinates.forEach(function(p){ring(p[0]);});}
        ctx.fillStyle=fill;ctx.fill();
        ctx.beginPath();
        if(geometry.type==='Polygon'){ring(geometry.coordinates[0]);}else{geometry.coordinates.forEach(function(p){ring(p[0]);});}
        ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();
    }

    function pxC(ctx,x,y,w,h,sz,col){
        ctx.fillStyle=col;
        [[x,y],[x+w-sz,y],[x,y+h-sz],[x+w-sz,y+h-sz]].forEach(function(c){ctx.fillRect(c[0],c[1],sz,sz);});
    }

    function renderCard(p, lat, lng, geometry, forestName) {
        var D='#0f380f',M='#306230',L='#8bac0f',B='#9bbc0f',WH='#e0f8d0';
        var tierInt=p.Tier||'',tierLbl=displayName(tierInt),ti=tIdx(tierInt);
        var conn=(p.connectivity||'No Data').toUpperCase();

        // ── Canvas: 960x900 at 2x  -  verified against Python preview ──────────
        var W=960,H=900,SC=2;
        var cv=document.createElement('canvas');
        cv.width=W*SC;cv.height=H*SC;
        var ctx=cv.getContext('2d');ctx.scale(SC,SC);

        // ── Layout constants ──────────────────────────────────────────────────
        var PAD=22,C1W=230,C2X=PAD+C1W+16,C2W=W-C2X-PAD;
        var HH=100,PLY=HH+10,BY=PLY+40,SPY=BY+76,CTY=SPY+50;
        var FY=H-52,AV=FY-CTY;
        // Left column: shape takes 40% of AV, QR gets the rest
        var SHH=Math.floor(AV*0.40);
        var QY=CTY+SHH+10,QH=FY-QY,QS=Math.min(QH-50,C1W-28);
        // Right column: mH fills AV exactly across 5 rows + 2 labels
        var mGAP=10,LBL_H=24,LBL_GAP=8;
        var mCOLS=2,mW=Math.floor((C2W-mGAP)/mCOLS);
        var mH=Math.floor((AV - 104) / 5);  // 104 = 4*mGAP + 2*LBL_H + 2*LBL_GAP
        var STRUCT_Y=CTY;
        var ECO_Y=STRUCT_Y+LBL_H+LBL_GAP+3*(mH+mGAP)+10;

        // background + grid
        ctx.fillStyle=D;ctx.fillRect(0,0,W,H);
        ctx.strokeStyle=M;ctx.lineWidth=1;
        for(var gx=0;gx<W;gx+=16){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke();}
        for(var gy=0;gy<H;gy+=16){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();}

        // border
        ctx.strokeStyle=B;ctx.lineWidth=4;ctx.strokeRect(2,2,W-4,H-4);
        ctx.strokeStyle=L;ctx.lineWidth=2;ctx.strokeRect(7,7,W-14,H-14);

        // header
        ctx.fillStyle=M;ctx.fillRect(4,4,W-8,HH);
        ctx.fillStyle=B;ctx.fillRect(4,HH,W-8,3);
        ctx.fillStyle=B;ctx.font=F(16);ctx.fillText('> FOREST PATCH REPORT CARD',PAD,30);
        ctx.fillStyle=L;ctx.font=F(11);ctx.fillText('MYFORESTCONNECT.ONLINE',PAD,62);
        if(p.id!=null){ctx.fillStyle=WH;ctx.font=F(11);var idT='PATCH #'+p.id;ctx.fillText(idT,W-PAD-ctx.measureText(idT).width,62);}

        // forest name strip
        ctx.fillStyle=D;ctx.fillRect(PAD,PLY,W-PAD*2,32);
        ctx.strokeStyle=L;ctx.lineWidth=1;ctx.strokeRect(PAD,PLY,W-PAD*2,32);
        var pn=forestName?'[ '+forestName+' ]':'[ LOCATION DATA UNAVAILABLE ]';
        ctx.fillStyle=B;ctx.font=F(11);
        while(ctx.measureText(pn).width>W-PAD*2-24&&pn.length>10)pn=pn.slice(0,-2)+'...]';
        ctx.fillText(pn,PAD+12,PLY+22);

        // tier badge
        ctx.fillStyle=M;ctx.fillRect(PAD,BY,330,58);
        ctx.strokeStyle=B;ctx.lineWidth=2;ctx.strokeRect(PAD,BY,330,58);
        var tfs=13;ctx.font=F(tfs);
        while(ctx.measureText(tierLbl).width>310&&tfs>8){tfs--;ctx.font=F(tfs);}
        ctx.fillStyle=B;ctx.fillText(tierLbl,PAD+12,BY+38);

        // connectivity badge
        var CX=PAD+344;
        ctx.fillStyle=D;ctx.fillRect(CX,BY,188,58);
        ctx.strokeStyle=B;ctx.lineWidth=2;ctx.strokeRect(CX,BY,188,58);
        ctx.fillStyle=L;ctx.font=F(10);ctx.fillText('CONNECTIVITY',CX+12,BY+20);
        ctx.fillStyle=B;ctx.font=F(13);ctx.fillText('[ '+conn+' ]',CX+12,BY+44);

        // gps badge
        var GX=CX+202;
        ctx.fillStyle='#1a4a1a';ctx.fillRect(GX,BY,W-GX-PAD,58);
        ctx.strokeStyle=L;ctx.lineWidth=1;ctx.strokeRect(GX,BY,W-GX-PAD,58);
        ctx.fillStyle=L;ctx.font=F(10);ctx.fillText('LOCATION',GX+12,BY+20);
        ctx.fillStyle=WH;ctx.font=F(10);
        if(lat&&lng){ctx.fillText(lat.toFixed(5)+'N',GX+12,BY+42);ctx.fillText(lng.toFixed(5)+'E',GX+12+Math.floor((W-GX-PAD)/2),BY+42);}
        else{ctx.fillText('UNAVAILABLE',GX+12,BY+42);}

        // spectrum bar
        var sW=Math.floor((W-PAD*2)/6);
        for(var si=0;si<6;si++){
            var sx=PAD+si*sW;
            ctx.fillStyle=TIER_SEG[si];ctx.fillRect(sx,SPY,sW,26);
            if(si===ti){ctx.strokeStyle=B;ctx.lineWidth=3;ctx.strokeRect(sx+1,SPY+1,sW-2,24);}
            ctx.fillStyle=TIER_TEXT[si];ctx.font=F(9);
            var tc=TIER_CODE[si];ctx.fillText(tc,sx+sW/2-ctx.measureText(tc).width/2,SPY+16);
        }
        if(ti>=0){
            var px=PAD+ti*sW+sW/2;
            ctx.fillStyle=B;ctx.beginPath();ctx.moveTo(px-9,SPY+28);ctx.lineTo(px+9,SPY+28);ctx.lineTo(px,SPY+40);ctx.closePath();ctx.fill();
        }

        // shape panel
        ctx.fillStyle=D;ctx.fillRect(PAD,CTY,C1W,SHH);
        ctx.strokeStyle=L;ctx.lineWidth=2;ctx.strokeRect(PAD,CTY,C1W,SHH);
        pxC(ctx,PAD,CTY,C1W,SHH,9,B);
        ctx.fillStyle=L;ctx.font=F(10);ctx.fillText('[ SHAPE ]',PAD+14,CTY+18);
        if(geometry){drawShape(ctx,geometry,PAD+10,CTY+30,C1W-20,SHH-42,M,B);}
        else{ctx.fillStyle=M;ctx.font=F(10);ctx.fillText('N/A',PAD+80,CTY+SHH/2);}

        // QR panel
        ctx.fillStyle=D;ctx.fillRect(PAD,QY,C1W,QH);
        ctx.strokeStyle=L;ctx.lineWidth=2;ctx.strokeRect(PAD,QY,C1W,QH);
        pxC(ctx,PAD,QY,C1W,QH,9,B);
        ctx.fillStyle=L;ctx.font=F(10);ctx.fillText('[ SCAN TO VIEW',PAD+14,QY+18);
        ctx.fillText('  ON PLATFORM ]',PAD+14,QY+34);

        // section label helper
        function secLabel(lbl,y){
            ctx.fillStyle=WH;ctx.font=F(11);ctx.fillText(lbl,C2X,y);
            ctx.strokeStyle=B;ctx.lineWidth=1;
            ctx.beginPath();ctx.moveTo(C2X,y+16);ctx.lineTo(W-PAD,y+16);ctx.stroke();
        }

        // metric card helper
        function metCard(mx,my,lbl,val,unit){
            ctx.fillStyle=D;ctx.fillRect(mx,my,mW,mH);
            ctx.strokeStyle=L;ctx.lineWidth=1;ctx.strokeRect(mx,my,mW,mH);
            pxC(ctx,mx,my,mW,mH,7,M);
            ctx.fillStyle=L;ctx.font=F(11);ctx.fillText(lbl,mx+10,my+18);
            var vfs=18;ctx.font=F(vfs);
            while(ctx.measureText(val).width>mW-22&&vfs>10){vfs--;ctx.font=F(vfs);}
            ctx.fillStyle=B;ctx.fillText(val,mx+10,my+Math.floor(mH/2)+8);
            if(unit){ctx.fillStyle=WH;ctx.font=F(12);ctx.fillText(unit,mx+10,my+mH-14);}
        }

        // structural metrics
        var nv=function(v){return v!=null?parseFloat(v):null;};
        var structMets=[
            {l:'TOTAL AREA', v:nv(p.area)     !=null?nv(p.area).toFixed(2)    :'--',u:'HA'},
            {l:'CORE AREA',  v:nv(p.core)     !=null?nv(p.core).toFixed(2)    :'--',u:'HA'},
            {l:'CONTIGUITY', v:nv(p.contig)   !=null?nv(p.contig).toFixed(3)  :'--',u:'0-1'},
            {l:'ENN DIST',   v:nv(p.enn)      !=null?Math.round(nv(p.enn))+'' :'--',u:'M'},
            {l:'PARA RATIO', v:nv(p.para)     !=null?nv(p.para).toFixed(5)    :'--',u:''},
            {l:'MEAN FLOW',  v:nv(p.mean_flow)!=null?nv(p.mean_flow).toFixed(2):'--',u:''}
        ];
        secLabel('STRUCTURAL METRICS', STRUCT_Y);
        structMets.forEach(function(m,i){
            var col=i%mCOLS,row=Math.floor(i/mCOLS);
            metCard(C2X+col*(mW+mGAP), STRUCT_Y+LBL_H+LBL_GAP+row*(mH+mGAP), m.l, m.v, m.u);
        });

        // ecological characteristics
        var ecoMets=[
            {l:'CANOPY HEIGHT', v:nv(p.canopy_height_m)!=null?nv(p.canopy_height_m).toFixed(1):'--', u:'M'},
            {l:'ELEVATION',     v:nv(p.elevation_m)    !=null?nv(p.elevation_m).toFixed(1)    :'--', u:'M'},
            {l:'SLOPE',         v:nv(p.slope_deg)      !=null?nv(p.slope_deg).toFixed(2)      :'--', u:'\u00b0'},
            {l:'BIOMASS',       v:nv(p.biomass_mgha)   !=null?nv(p.biomass_mgha).toFixed(1)   :'--', u:'MG/HA'}
        ];
        secLabel('ECOLOGICAL CHARACTERISTICS', ECO_Y);
        ecoMets.forEach(function(m,i){
            var col=i%mCOLS,row=Math.floor(i/mCOLS);
            metCard(C2X+col*(mW+mGAP), ECO_Y+LBL_H+LBL_GAP+row*(mH+mGAP), m.l, m.v, m.u);
        });

        // footer
        function drawFooter(){
            ctx.fillStyle=M;ctx.fillRect(0,FY,W,H-FY);
            ctx.fillStyle=B;ctx.fillRect(0,FY,W,3);
            ctx.fillStyle=B;ctx.font=F(10);
            var dd=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}).toUpperCase();
            ctx.fillText('> GENERATED '+dd,PAD,FY+22);
            ctx.fillStyle=D;ctx.font=F(10);
            var dis='FOR REFERENCE ONLY';
            ctx.fillText(dis,W-PAD-ctx.measureText(dis).width,FY+22);
        }

        // load QR then download
        var qi=new Image();qi.crossOrigin='anonymous';
        qi.onload=function(){
            var qx=PAD+Math.floor((C1W-QS)/2),qy=QY+50;
            ctx.drawImage(qi,qx,qy,QS,QS);
            var scY=qy+QS+8;
            if(scY+12<QY+QH){ctx.fillStyle=L;ctx.font=F(8);var st='OPEN IN PLATFORM';ctx.fillText(st,PAD+Math.floor((C1W-ctx.measureText(st).width)/2),scY+10);}
            drawFooter();dl();
        };
        qi.onerror=function(){drawFooter();dl();};
        qi.src=qrUrl(lat,lng);

        function dl(){
            var a=document.createElement('a');
            a.download='patch_'+(p.id!=null?p.id:'report')+'_report_card.png';
            a.href=cv.toDataURL('image/png',1.0);a.click();
        }
    }

    if(document.readyState!=='loading'){initReportCards();}
    else{document.addEventListener('DOMContentLoaded',initReportCards);}

})();

// ═══════════════════════════════════════════════════════════════════════════
// ROAD DRAWING TOOL v3
// Lazy-initialised. Adds a permeability profile to the reliable metrics.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var DRAW_CSS = 'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.4.3/mapbox-gl-draw.css';
    var DRAW_JS  = 'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.4.3/mapbox-gl-draw.js';
    var TURF_JS  = 'https://cdnjs.cloudflare.com/ajax/libs/Turf.js/6.5.0/turf.min.js';

    var scriptsLoaded  = false;
    var drawInstance   = null;
    var mapRef         = null;
    var drawActive     = false;
    var _onDrawCreate  = null;

    // ── Union-Find ────────────────────────────────────────────────────────
    function makeUF(ids) {
        var parent = {}, rank = {};
        ids.forEach(function (id) { parent[id] = id; rank[id] = 0; });
        function find(x) {
            if (parent[x] === undefined) { parent[x] = x; rank[x] = 0; }
            if (parent[x] !== x) parent[x] = find(parent[x]);
            return parent[x];
        }
        function union(a, b) {
            var ra = find(a), rb = find(b);
            if (ra === rb) return;
            if (rank[ra] < rank[rb]) parent[ra] = rb;
            else if (rank[ra] > rank[rb]) parent[rb] = ra;
            else { parent[rb] = ra; rank[ra]++; }
        }
        function componentCount() {
            var roots = {};
            Object.keys(parent).forEach(function (id) { roots[find(id)] = true; });
            return Object.keys(roots).length;
        }
        return { union: union, componentCount: componentCount };
    }

    // ── Inject FAB ────────────────────────────────────────────────────────
    function injectFab() {
        var interval = setInterval(function () {
            var corridorBtn = document.getElementById('corridor-toggle-fab');
            if (!corridorBtn) return;
            if (document.getElementById('road-draw-wrapper')) { clearInterval(interval); return; }
            clearInterval(interval);

            var wrapper = document.createElement('div');
            wrapper.id = 'road-draw-wrapper';
            wrapper.style.cssText = 'margin-top:-2px;';

            var btn = document.createElement('button');
            btn.id = 'road-draw-fab';
            btn.innerHTML = '&#9998; Draw road';
            btn.title = 'Draw a line to assess landscape permeability and connectivity impact';
            btn.style.cssText =
                'display:block;width:100%;padding:8px 14px;margin-top:0;' +
                'background:#8B1A1A;color:white;border:none;border-radius:4px;' +
                'font-size:12px;font-weight:600;cursor:pointer;box-sizing:border-box;' +
                'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
                'transition:background 0.15s;';

            wrapper.appendChild(btn);
            var levelPanel = document.getElementById('conn-level-toggles');
            var anchor = levelPanel || corridorBtn;
            anchor.parentNode.insertBefore(wrapper, anchor.nextSibling);

            btn.addEventListener('click', onFabClick);

            // After app.js finishes styling corridor button, sync sizing
            setTimeout(function () {
                var cs = window.getComputedStyle(corridorBtn);
                btn.style.padding      = cs.padding;
                btn.style.fontSize     = cs.fontSize;
                btn.style.fontWeight   = cs.fontWeight;
                btn.style.fontFamily   = cs.fontFamily;
                btn.style.borderRadius = cs.borderRadius;
                btn.style.lineHeight   = cs.lineHeight;
            }, 800);
        }, 400);
    }

    function getMap() {
        if (!mapRef && window._mapInstance) mapRef = window._mapInstance;
        return mapRef;
    }

    // ── FAB click ─────────────────────────────────────────────────────────
    function corridorsAreVisible(map) {
        try {
            return map.getLayer('connector-solid') &&
                   map.getLayoutProperty('connector-solid', 'visibility') === 'visible';
        } catch(e) { return false; }
    }

    function onFabClick() {
        var map = getMap(); if (!map) return;

        if (corridorsAreVisible(map)) {
            var el = document.getElementById('patch-info-content');
            if (el) {
                el.innerHTML =
                    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">' +
                    '<div style="background:#8B1A1A;color:#fff;padding:6px 10px;border-radius:3px;font-weight:700;margin-bottom:10px;font-size:0.82em">&#9998; DEVELOPMENT LINE TOOL</div>' +
                    '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:8px 12px;font-size:0.87em;line-height:1.6;color:#856404">' +
                    'Please hide the corridors before drawing a line. Click <strong>Hide corridors</strong> in the map controls, then try again.</div></div>';
                openSidebar();
            }
            return;
        }

        if (drawActive) { startDraw(map); return; }
        if (!scriptsLoaded) {
            var btn = document.getElementById('road-draw-fab');
            if (btn) { btn.innerHTML = '&#9203; Loading&#8230;'; btn.disabled = true; }
            loadDeps(function () {
                scriptsLoaded = true;
                if (btn) { btn.disabled = false; }
                startDraw(map);
            });
        } else {
            startDraw(map);
        }
    }

    function loadDeps(cb) {
        if (!document.querySelector('link[href="' + DRAW_CSS + '"]')) {
            var lnk = document.createElement('link');
            lnk.rel = 'stylesheet'; lnk.href = DRAW_CSS;
            document.head.appendChild(lnk);
        }
        loadScript(DRAW_JS, function () { loadScript(TURF_JS, cb); });
    }
    function loadScript(src, cb) {
        var s = document.createElement('script');
        s.src = src; s.onload = cb;
        s.onerror = function () { cb(); };
        document.head.appendChild(s);
    }

    // ── Start draw ────────────────────────────────────────────────────────
    function startDraw(map) {
        // Stop the corridor glow animation loop  -  it calls setPaintProperty
        // every frame and conflicts with MapboxDraw's map manipulation
        if (window.connAnimFrame) {
            cancelAnimationFrame(window.connAnimFrame);
            window.connAnimFrame = null;
        }
        // Also cancel via app.js variable if accessible
        try { if (typeof connAnimFrame !== 'undefined' && connAnimFrame) {
            cancelAnimationFrame(connAnimFrame); connAnimFrame = null;
        }} catch(e) {}

        // Hide corridor layers so their event handlers don't intercept draw clicks
        var _corrVisibility = {};
        ['connector-glow', 'connector-solid'].forEach(function (id) {
            try {
                if (map.getLayer(id)) {
                    _corrVisibility[id] = map.getLayoutProperty(id, 'visibility') || 'none';
                    map.setLayoutProperty(id, 'visibility', 'none');
                }
            } catch(e) {}
        });
        window._corrVisibilitySnapshot = _corrVisibility;

        // Reuse existing draw instance if possible  -  avoids layer re-registration
        // conflicts that occur when removing and re-adding the control
        if (drawInstance) {
            try {
                drawInstance.deleteAll();
                drawInstance.changeMode('draw_line_string');
            } catch(e) {
                // If reuse fails, remove and recreate
                try { map.removeControl(drawInstance); } catch(e2) {}
                drawInstance = null;
            }
        }

        if (!drawInstance) {
            drawInstance = new MapboxDraw({
                displayControlsDefault: false,
                controls: {},
                styles: [
                    {
                        id: 'road-line',
                        type: 'line',
                        filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
                        paint: { 'line-color': '#ff4444', 'line-width': 3, 'line-dasharray': [4, 2] }
                    },
                    {
                        id: 'road-vertex',
                        type: 'circle',
                        filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']],
                        paint: { 'circle-radius': 5, 'circle-color': '#ff4444', 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' }
                    }
                ]
            });
            map.addControl(drawInstance);
            // Give the control time to register its layers before changing mode
            setTimeout(function () {
                try { drawInstance.changeMode('draw_line_string'); } catch(e) {}
            }, 150);
        }

        drawActive = true;

        if (_onDrawCreate) map.off('draw.create', _onDrawCreate);
        _onDrawCreate = function (e) {
            map.off('draw.create', _onDrawCreate);
            _onDrawCreate = null;
            drawActive = false;
            restoreCorridors(map);
            showFabPair();
            analyseRoad(e.features[0], map);
        };
        map.on('draw.create', _onDrawCreate);

        showHint();
        openSidebar();
    }

    function restoreCorridors(map) {
        var snap = window._corrVisibilitySnapshot;
        if (!snap || !map) return;
        Object.keys(snap).forEach(function (id) {
            try {
                if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', snap[id]);
            } catch(e) {}
        });
        window._corrVisibilitySnapshot = null;
    }

    function removeDraw() {
        var map = getMap();
        restoreCorridors(map);
        if (drawInstance && map) {
            try { map.removeControl(drawInstance); } catch(e) {}
            drawInstance = null;
        }
        if (_onDrawCreate && map) { map.off('draw.create', _onDrawCreate); _onDrawCreate = null; }
        drawActive = false;
        var wrapper = document.getElementById('road-draw-wrapper');
        if (!wrapper) return;
        wrapper.innerHTML = '';
        wrapper.style.cssText = 'margin-top:-2px;';
        var btn = document.createElement('button');
        btn.id = 'road-draw-fab';
        btn.innerHTML = '&#9998; Draw road';
        btn.style.cssText =
            'display:block;width:100%;padding:8px 14px;margin-top:0;' +
            'background:#8B1A1A;color:white;border:none;border-radius:4px;' +
            'font-size:12px;font-weight:600;cursor:pointer;box-sizing:border-box;' +
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
        btn.addEventListener('click', onFabClick);
        wrapper.appendChild(btn);
    }

    function showFabPair() {
        var wrapper = document.getElementById('road-draw-wrapper'); if (!wrapper) return;
        wrapper.innerHTML = '';
        wrapper.style.cssText = 'margin-top:-2px;display:flex;gap:6px;';
        var redrawBtn = document.createElement('button');
        redrawBtn.innerHTML = '&#9998; Redraw';
        redrawBtn.style.cssText = 'flex:1;padding:7px 8px;background:#8B1A1A;color:white;border:none;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;';
        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&#10006; Close';
        closeBtn.style.cssText = 'flex:1;padding:7px 8px;background:#555;color:white;border:none;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;';
        redrawBtn.addEventListener('click', function () { startDraw(getMap()); });
        closeBtn.addEventListener('click', function () { deactivateGuard(); removeDraw(); resetSidebar(); });
        wrapper.appendChild(redrawBtn);
        wrapper.appendChild(closeBtn);
    }

    // ── Sidebar helpers ───────────────────────────────────────────────────
    function showHint() {
        var el = document.getElementById('patch-info-content'); if (!el) return;

        // Check if corridors are currently visible
        var map = getMap();
        var corridorsVisible = false;
        try {
            var vis = map && map.getLayer('connector-solid') &&
                      map.getLayoutProperty('connector-solid', 'visibility');
            corridorsVisible = (vis === 'visible');
        } catch(e) {}

        var corrNote = corridorsVisible
            ? '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;' +
              'padding:7px 10px;margin-bottom:10px;font-size:0.82em;line-height:1.5;color:#856404">' +
              'Corridors are currently visible. They will be hidden while you draw and restored when done. ' +
              'Or <button id="hide-corr-btn" style="background:none;border:none;color:#856404;' +
              'text-decoration:underline;cursor:pointer;font-size:inherit;padding:0;font-family:inherit">' +
              'hide them now</button> before starting.</div>'
            : '';

        el.innerHTML =
            '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">' +
            '<div style="background:#8B1A1A;color:#fff;padding:6px 10px;border-radius:3px;font-weight:700;margin-bottom:10px;font-size:0.82em">&#9998; DEVELOPMENT LINE TOOL</div>' +
            corrNote +
            '<p style="font-size:0.87em;line-height:1.5;margin:0 0 12px">Click on the map to draw a line. Double-click to finish.</p>' +
            '<p style="font-size:0.82em;color:#888;font-style:italic;margin:0">Analysis will appear here once the line is complete.</p></div>';

        // Wire up hide button if shown
        if (corridorsVisible) {
            var hideBtn = document.getElementById('hide-corr-btn');
            if (hideBtn) {
                hideBtn.addEventListener('click', function () {
                    try {
                        var toggleBtn = document.getElementById('corridor-toggle-fab');
                        if (toggleBtn) toggleBtn.click();
                    } catch(e) {}
                    showHint(); // refresh hint to remove the notice
                });
            }
        }
    }

    function openSidebar() {
        var sb = document.getElementById('sidebar');
        if (sb && sb.classList.contains('collapsed')) document.getElementById('toggle-sidebar-btn').click();
        var panel = document.getElementById('info-panel-section');
        if (panel) setTimeout(function () { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
    }

    function resetSidebar() {
        deactivateGuard();
        var el = document.getElementById('patch-info-content');
        if (el) el.innerHTML = 'Select a patch on the map to see details.';
    }

    // ── Guard: prevent patch clicks overriding tool results ───────────────
    var _roadToolContent   = null;
    var _roadToolGuard     = false;
    var _roadToolRestoring = false;
    var _contentObserver   = new MutationObserver(function () {
        if (!_roadToolGuard || !_roadToolContent || _roadToolRestoring) return;
        var el = document.getElementById('patch-info-content'); if (!el) return;
        if (el.innerHTML !== _roadToolContent) {
            _roadToolRestoring = true;
            var notice =
                '<div style="background:#fdecea;border:1px solid #f5c6cb;border-radius:4px;' +
                'padding:8px 12px;margin-bottom:10px;font-size:0.84em;line-height:1.6;color:#721c24;' +
                'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">' +
                '<strong>Patch details are not available while the development line tool is active.</strong><br>' +
                'Press <strong>&#10006; Close</strong> in the button above, or scroll down and click <strong>Close</strong>, then click the patch again.</div>';
            el.innerHTML = notice + _roadToolContent;
            var r = el.querySelector('#road-results-redraw');
            var c = el.querySelector('#road-results-close');
            if (r) r.addEventListener('click', function () { deactivateGuard(); startDraw(getMap()); });
            if (c) c.addEventListener('click', function () { deactivateGuard(); removeDraw(); resetSidebar(); });
            setTimeout(function () { _roadToolRestoring = false; }, 0);
        }
    });
    (function () {
        function observe() {
            var el = document.getElementById('patch-info-content');
            if (el) _contentObserver.observe(el, { childList: true, subtree: true, characterData: true });
        }
        if (document.readyState !== 'loading') observe();
        else document.addEventListener('DOMContentLoaded', observe);
    })();
    function activateGuard(html)  { _roadToolContent = html; _roadToolGuard = true; }
    function deactivateGuard()    { _roadToolGuard = false; _roadToolContent = null; _roadToolRestoring = false; }

    // ── Analysis ──────────────────────────────────────────────────────────
    function analyseRoad(lineFeature, map) {
        var el = document.getElementById('patch-info-content'); if (!el) return;
        el.innerHTML = '<div style="padding:8px;font-size:0.87em">Analysing&#8230;</div>';
        if (!window.turf) { el.innerHTML = '<div style="color:red;padding:8px">Turf.js failed to load.</div>'; return; }

        var lineGJ = { type: 'Feature', geometry: lineFeature.geometry };

        // ── 50m line buffer (road footprint) ──────────────────────────────
        var lineBuffer = null;
        try { lineBuffer = turf.buffer(lineGJ, 0.05, { units: 'kilometers' }); } catch(e) {}

        // ── 300m corridor buffer (potential movement corridor zone) ───────────────
        // Corridor lines are for illustration only; the actual movement zone
        // they represent extends well beyond the line itself.
        var corrBuffers = [];
        var corrFeats = [];
        try { corrFeats = map.queryRenderedFeatures({ layers: ['connector-solid'] }); } catch(e) {}
        corrFeats.forEach(function (f) {
            try {
                var buf = turf.buffer({ type: 'Feature', geometry: f.geometry }, 0.3, { units: 'kilometers' });
                if (buf) corrBuffers.push({ buf: buf, props: f.properties });
            } catch(e) {}
        });

        // ── Query visible patches ─────────────────────────────────────────
        var patchFeats = [];
        try {
            var style = map.getStyle();
            var pl = (style.layers || []).find(function (l) {
                return l.type === 'fill' && (
                    l.id.toLowerCase().includes('forest') ||
                    l.id.toLowerCase().includes('patch') ||
                    l.id.toLowerCase().includes('klang') ||
                    l.id.toLowerCase().includes('kuantan')
                );
            });
            if (pl) patchFeats = map.queryRenderedFeatures({ layers: [pl.id] });
        } catch(e) {}

        // ── Patches directly intersected ──────────────────────────────────
        var hitPatches = [];
        patchFeats.forEach(function (f) {
            try { if (lineBuffer && turf.booleanIntersects(lineBuffer, f)) hitPatches.push(f.properties); } catch(e) {}
        });

        // ── Corridors severed (50m buffer) ────────────────────────────────
        var severed = [];
        var severedSet = {};
        corrFeats.forEach(function (f) {
            try {
                var corrFeat = { type: 'Feature', geometry: f.geometry };
                var hit = false;
                var pts = turf.lineIntersect(lineGJ, corrFeat);
                if (pts.features.length > 0) hit = true;
                if (!hit && lineBuffer) hit = turf.booleanIntersects(lineBuffer, corrFeat);
                if (hit) {
                    severed.push(f.properties);
                    severedSet[f.properties.id_from + '_' + f.properties.id_to] = true;
                }
            } catch(e) {}
        });

        // ── Network bottleneck ────────────────────────────────────────────
        var allPatchIds = {};
        patchFeats.forEach(function (f) {
            if (f.properties && f.properties.id != null) allPatchIds[String(f.properties.id)] = true;
        });
        var allEdges = [], remainingEdges = [];
        corrFeats.forEach(function (f) {
            var p = f.properties; if (!p) return;
            var e = [String(p.id_from), String(p.id_to)];
            allEdges.push(e);
            if (!severedSet[p.id_from + '_' + p.id_to]) remainingEdges.push(e);
        });
        var idArr = Object.keys(allPatchIds);
        var ufBefore = makeUF(idArr); allEdges.forEach(function (e) { ufBefore.union(e[0], e[1]); });
        var ufAfter  = makeUF(idArr); remainingEdges.forEach(function (e) { ufAfter.union(e[0], e[1]); });
        var compBefore = ufBefore.componentCount(), compAfter = ufAfter.componentCount();
        var isBottleneck = compAfter > compBefore;

        // ── Patches losing all connections ────────────────────────────────
        var patchCorrMap = {};
        corrFeats.forEach(function (f) {
            var p = f.properties; if (!p) return;
            var key = p.id_from + '_' + p.id_to;
            [p.id_from, p.id_to].forEach(function (pid) {
                if (pid == null) return;
                pid = String(pid);
                if (!patchCorrMap[pid]) patchCorrMap[pid] = [];
                patchCorrMap[pid].push(key);
            });
        });
        var isolated = [];
        Object.keys(patchCorrMap).forEach(function (pid) {
            var rem = patchCorrMap[pid].filter(function (k) { return !severedSet[k]; });
            if (rem.length === 0) {
                var pf = patchFeats.find(function (f) { return String(f.properties && f.properties.id) === pid; });
                if (pf) isolated.push(pf.properties);
            }
        });

        // ── Permeability profile ──────────────────────────────────────────
        // Measures what proportion of the drawn line passes through:
        //   1. Forest patches (direct habitat loss  -  most sensitive)
        //   2. Corridor movement zones (300m buffer  -  functionally sensitive)
        //   3. Open matrix (least ecologically sensitive)
        // Calculated as proportion of total line length overlapping each zone.
        var totalLength = 0;
        try { totalLength = turf.length(lineGJ, { units: 'kilometers' }); } catch(e) {}

        var patchLength = 0, corrLength = 0;
        if (totalLength > 0) {
            // Patch overlap: clip line to union of all patch polygons
            patchFeats.forEach(function (f) {
                try {
                    if (!turf.booleanIntersects(lineGJ, f)) return;
                    // Use lineIntersect to get entry/exit points, then measure
                    // overlapping subsegments via splitting
                    var clipped = turf.lineSplit(lineGJ, f);
                    if (!clipped || !clipped.features) return;
                    clipped.features.forEach(function (seg) {
                        try {
                            // Check if segment midpoint is inside the patch
                            var coords = seg.geometry.coordinates;
                            if (coords.length < 2) return;
                            var mid = turf.midpoint(
                                { type: 'Feature', geometry: { type: 'Point', coordinates: coords[0] } },
                                { type: 'Feature', geometry: { type: 'Point', coordinates: coords[coords.length - 1] } }
                            );
                            if (turf.booleanPointInPolygon(mid, f)) {
                                patchLength += turf.length(seg, { units: 'kilometers' });
                            }
                        } catch(e2) {}
                    });
                } catch(e) {}
            });

            // Corridor movement zone overlap: clip line to 300m corridor buffers
            var corrCounted = {};
            corrBuffers.forEach(function (cb) {
                try {
                    if (!turf.booleanIntersects(lineGJ, cb.buf)) return;
                    var clipped = turf.lineSplit(lineGJ, cb.buf);
                    if (!clipped || !clipped.features) return;
                    clipped.features.forEach(function (seg) {
                        try {
                            var coords = seg.geometry.coordinates;
                            if (coords.length < 2) return;
                            var mid = turf.midpoint(
                                { type: 'Feature', geometry: { type: 'Point', coordinates: coords[0] } },
                                { type: 'Feature', geometry: { type: 'Point', coordinates: coords[coords.length - 1] } }
                            );
                            if (turf.booleanPointInPolygon(mid, cb.buf)) {
                                // Avoid double-counting with patch-covered sections
                                var segLen = turf.length(seg, { units: 'kilometers' });
                                // Check not already counted as patch
                                var alreadyPatch = patchFeats.some(function (pf) {
                                    try { return turf.booleanPointInPolygon(mid, pf); } catch(e) { return false; }
                                });
                                if (!alreadyPatch) corrLength += segLen;
                            }
                        } catch(e2) {}
                    });
                } catch(e) {}
            });
        }

        // Clamp values
        patchLength = Math.min(patchLength, totalLength);
        corrLength  = Math.min(corrLength, totalLength - patchLength);
        var matrixLength = Math.max(0, totalLength - patchLength - corrLength);

        var patchPct  = totalLength > 0 ? Math.round(patchLength  / totalLength * 100) : 0;
        var corrPct   = totalLength > 0 ? Math.round(corrLength   / totalLength * 100) : 0;
        var matrixPct = Math.max(0, 100 - patchPct - corrPct);

        // ── Helpers ───────────────────────────────────────────────────────
        var TIER_MAP = {
            'Tier 1 (Core Habitat)':              'Primary forest',
            'Tier 2 (Major Stepping Stones)':     'Established forest',
            'Tier 3 (Connected Fragments)':       'Functional fragment',
            'Tier 4 (Vulnerable Edge Fragments)': 'Vulnerable fragment',
            'Tier 5 (Isolated Fragments)':        'Marginal fragment',
            'Tier 6 (Isolated Micro Patches)':    'Remnant patch'
        };
        function tLabel(t) {
            return (typeof TIER_DISPLAY_NAMES !== 'undefined' && TIER_DISPLAY_NAMES[t]) || TIER_MAP[t] || t || 'Unknown';
        }
        function byTier(arr) {
            var c = {};
            arr.forEach(function (p) { var t = p.Tier || p.tier || 'Unknown'; c[t] = (c[t] || 0) + 1; });
            return c;
        }
        function byConn(arr) {
            var c = { High: 0, Moderate: 0, Low: 0 };
            arr.forEach(function (p) { if (c[p.connectivity] !== undefined) c[p.connectivity]++; });
            return c;
        }
        function badge(txt, bg, fg) {
            return '<span style="display:inline-block;padding:2px 8px;border-radius:3px;background:' +
                   bg + ';color:' + fg + ';font-size:0.82em;font-weight:700;margin-right:4px">' + txt + '</span>';
        }
        function secHdr(txt) {
            return '<div style="font-weight:700;font-size:0.85em;margin:12px 0 4px;padding-bottom:3px;' +
                   'border-bottom:1px solid #ddd">' + txt + '</div>';
        }

        var hitTiers  = byTier(hitPatches);
        var isoTiers  = byTier(isolated);
        var corrConns = byConn(severed);
        var CONN_C = { High: '#00ffff', Moderate: '#ffff00', Low: '#ff3300' };
        var CONN_T = { High: '#000', Moderate: '#000', Low: '#fff' };

        // ── Narrative ─────────────────────────────────────────────────────
        var parts = [];

        if (severed.length === 0 && hitPatches.length === 0 && patchPct === 0) {
            parts.push('<span style="color:#888;font-style:italic">No patches or corridors were intersected at the current zoom level. Try zooming in or redrawing.</span>');
        } else {
            // Lead with permeability
            if (totalLength > 0) {
                var lineKm = Math.round(totalLength * 10) / 10;
                var permLines = [];
                permLines.push('Of the total <strong>' + lineKm + ' km</strong> drawn: <strong>' + patchPct + '%</strong> passes through forest patches, <strong>' + corrPct + '%</strong> through potential movement corridor zones (300 m around mapped corridors), and <strong>' + matrixPct + '%</strong> through open matrix.');
                if (patchPct > 0) {
                    permLines.push('The <strong>' + patchPct + '%</strong> through forest represents direct habitat loss: development removes vegetation, compacts soil, introduces noise and light pollution, and creates a hard barrier that most forest-interior species cannot cross. Even a narrow road through a patch effectively splits it into two separate units with different ecological trajectories.');
                }
                if (corrPct > 0) {
                    permLines.push('The <strong>' + corrPct + '%</strong> through potential movement corridor zones would disrupt wildlife transit between patches. These are the areas where species are most likely to be moving through the landscape, making them disproportionately sensitive to any barrier effect.');
                }
                if (matrixPct > 0 && (patchPct > 0 || corrPct > 0)) {
                    permLines.push('The <strong>' + matrixPct + '%</strong> through open matrix carries the lowest direct ecological impact, though roads through matrix can still pose risk to wildlife and suppress movement for edge-sensitive species.');
                }

                permLines.forEach(function (line) { parts.push(line); });
            }
            // Fragmentation - specific tier names, no repetition of network integrity box
            if (hitPatches.length > 0) {
                var tierList = Object.keys(hitTiers).sort().map(function (t) {
                    return '<strong>' + hitTiers[t] + ' ' + tLabel(t) + (hitTiers[t] > 1 ? ' patches' : ' patch') + '</strong>';
                }).join(', ');
                parts.push('The line directly bisects: ' + tierList + '. Once bisected, these patches will have reduced interior area and increased edge on both sides of the development line.');
            }

                        // Bottleneck
            if (isBottleneck) {
                parts.push('<strong>Network structural split detected.</strong> The visible forest network would fragment into <strong>' +
                    compAfter + ' disconnected components</strong> (currently ' + compBefore + '). Entire groups of patches would lose all connectivity to one another.');
            } else if (severed.length > 0) {
                parts.push('No full network split at this scale, but any reduction in corridor capacity has cumulative consequences. Forest loss is rarely offset by alternative routes, and each severed connection increases the isolation of the patches it served.');
            }

                        // Isolation
            var highTierIso = (isoTiers['Tier 1 (Core Habitat)'] || 0) + (isoTiers['Tier 2 (Major Stepping Stones)'] || 0);
            if (highTierIso > 0) {
                parts.push('<strong>' + highTierIso + '</strong> Primary or Established forest patch' +
                    (highTierIso > 1 ? 'es' : '') + ' would lose all visible corridor connections, becoming functionally isolated.');
            }
        }

        // ── Build HTML ────────────────────────────────────────────────────
        var s = '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:0.87em">';

        s += '<div style="background:#8B1A1A;color:#fff;padding:6px 10px;border-radius:3px;font-weight:700;margin-bottom:10px;font-size:0.82em">&#9998; DEVELOPMENT LINE ANALYSIS</div>';

        // Disclaimer
        s += '<div style="background:#fff8e1;border:1px solid #f0c040;border-radius:4px;padding:7px 10px;margin-bottom:12px;font-size:0.80em;line-height:1.5;color:#5a4000">' +
             '<strong>Indicative only.</strong> Based on features visible in the current viewport. Not a formal environmental impact assessment.</div>';

        // Narrative
        s += '<div style="margin-bottom:12px">' +
             parts.map(function (p) { return '<p style="margin:0 0 8px;line-height:1.6">' + p + '</p>'; }).join('') +
             '</div>';

        // Permeability bar
        if (totalLength > 0) {
            s += secHdr('Landscape permeability profile');
            s += '<div style="margin:6px 0 4px;border-radius:4px;overflow:hidden;height:20px;display:flex">';
            if (patchPct  > 0) s += '<div style="width:' + patchPct  + '%;background:#2a6b0a;title:Forest" title="Forest patches: ' + patchPct + '%"></div>';
            if (corrPct   > 0) s += '<div style="width:' + corrPct   + '%;background:#f0c040;title:Corridor" title="Movement zones: ' + corrPct + '%"></div>';
            if (matrixPct > 0) s += '<div style="width:' + matrixPct + '%;background:#bbb;" title="Open matrix: ' + matrixPct + '%"></div>';
            s += '</div>';
            s += '<div style="display:flex;gap:12px;font-size:0.78em;margin-bottom:4px">';
            s += '<span><span style="display:inline-block;width:10px;height:10px;background:#2a6b0a;border-radius:2px;margin-right:3px"></span>Forest ' + patchPct + '%</span>';
            s += '<span><span style="display:inline-block;width:10px;height:10px;background:#f0c040;border-radius:2px;margin-right:3px"></span>Movement zone ' + corrPct + '%</span>';
            s += '<span><span style="display:inline-block;width:10px;height:10px;background:#bbb;border-radius:2px;margin-right:3px"></span>Matrix ' + matrixPct + '%</span>';
            s += '</div>';
            s += '<div style="font-size:0.78em;color:#888;font-style:italic;margin-bottom:4px">Movement corridor zones use a 300 m buffer around each corridor. A line routed predominantly through open matrix has lower direct ecological impact than one crossing forest or functional movement areas.</div>';
        }

        // Corridors severed
        s += secHdr('Corridors severed: ' + severed.length);
        if (severed.length > 0) {
            ['High','Moderate','Low'].forEach(function (c) {
                if (corrConns[c] > 0) s += badge(corrConns[c] + '\u00a0' + c, CONN_C[c], CONN_T[c]);
            });
            s += '<br>';
        }

        s += secHdr('Network integrity');
        if (isBottleneck) {
            s += '<div style="background:#fdecea;border:1px solid #f5c6cb;border-radius:4px;padding:6px 10px;font-size:0.82em;line-height:1.5;color:#721c24;margin-bottom:4px">' +
                 '<strong>Structural split detected:</strong> the network fragments into ' + compAfter +
                 ' disconnected components (currently ' + compBefore + '). Entire groups of patches would lose all connectivity to one another.</div>';
        } else if (severed.length > 0) {
            s += '<div style="background:#fdecea;border:1px solid #f5c6cb;border-radius:4px;padding:6px 10px;font-size:0.82em;line-height:1.5;color:#721c24;margin-bottom:4px">' +
                 '<strong>Connectivity reduced.</strong> No full structural split at this scale, but any removal of forest or corridor capacity has cumulative consequences. ' +
                 'Forest loss is rarely offset by alternative routes, and each severed connection increases the isolation of the patches it served.</div>';
        }
        if (hitPatches.length > 0) {
            s += '<div style="background:#fdecea;border:1px solid #f5c6cb;border-radius:4px;padding:6px 10px;font-size:0.82em;line-height:1.5;color:#721c24;margin-bottom:4px">' +
                 '<strong>Patch fragmentation:</strong> ' + hitPatches.length + ' forest patch' + (hitPatches.length > 1 ? 'es are' : ' is') +
                 ' directly bisected by this line. Each bisected patch is split into two new units with their own edge environments. ' +
                 'Even if one resulting fragment remains connected to the corridor network, the other may not. ' +
                 'Interior habitat is reduced on both sides regardless of size, and the new edge created persists as a permanent barrier to within-patch movement.</div>';
        }
        if (!isBottleneck && severed.length === 0 && hitPatches.length === 0) {
            s += '<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:4px;padding:6px 10px;font-size:0.82em;line-height:1.5;color:#1b5e20">' +
                 'No corridor severance or patch intersection detected at this zoom level.</div>';
        }

                // Patches intersected
        if (hitPatches.length > 0) {
            s += secHdr('Forest patches directly intersected: ' + hitPatches.length);
            s += '<ul style="margin:2px 0 0;padding-left:16px;line-height:1.8">';
            Object.keys(hitTiers).sort().forEach(function (t) {
                s += '<li>' + hitTiers[t] + '\u00d7 ' + tLabel(t) + '</li>';
            });
            s += '</ul>';
        }

        // Patches losing all connections
        if (isolated.length > 0) {
            s += secHdr('Patches losing all connections: ' + isolated.length);
            s += '<ul style="margin:2px 0 0;padding-left:16px;line-height:1.8">';
            Object.keys(isoTiers).sort().forEach(function (t) {
                s += '<li>' + isoTiers[t] + '\u00d7 ' + tLabel(t) + '</li>';
            });
            s += '</ul>';
        }

        // Buttons
        s += '<div style="display:flex;gap:8px;margin-top:18px">';
        s += '<button id="road-results-redraw" style="flex:1;padding:7px 10px;background:#8B1A1A;color:white;border:none;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">&#9998; Redraw</button>';
        s += '<button id="road-results-close"  style="flex:1;padding:7px 10px;background:#555;color:white;border:none;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">&#215; Close</button>';
        s += '</div></div>';

        el.innerHTML = s;
        activateGuard(s);

        var r = el.querySelector('#road-results-redraw');
        var c = el.querySelector('#road-results-close');
        if (r) r.addEventListener('click', function () { deactivateGuard(); startDraw(map); });
        if (c) c.addEventListener('click', function () { deactivateGuard(); removeDraw(); resetSidebar(); });

        openSidebar();
    }

    // ── Boot ─────────────────────────────────────────────────────────────
    if (document.readyState !== 'loading') injectFab();
    else document.addEventListener('DOMContentLoaded', injectFab);

})();
