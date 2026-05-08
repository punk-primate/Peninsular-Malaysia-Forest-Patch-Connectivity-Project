// features.js — myforestconnect retro report cards
//
// HOW TO USE:
//   Add one line before <script src="config.js"> in each map HTML file:
//       <script src="features.js"></script>
//   Remove that line to revert completely.
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

        // ── Canvas: 960x900 at 2x — verified against Python preview ──────────
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
// ROAD DRAWING TOOL — lazy initialised
// Scripts and draw control only load when user clicks the FAB.
// Draw control is removed when user closes/clears, so it never interferes
// with normal map interaction.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var DRAW_CSS = 'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.4.3/mapbox-gl-draw.css';
    var DRAW_JS  = 'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.4.3/mapbox-gl-draw.js';
    var TURF_JS  = 'https://cdnjs.cloudflare.com/ajax/libs/Turf.js/6.5.0/turf.min.js';

    var scriptsLoaded = false;
    var drawInstance  = null;
    var drawActive    = false;
    var mapRef        = null;

    // ── Inject FAB button alongside corridor toggle ───────────────────────────
    function injectFab() {
        var interval = setInterval(function () {
            var corridorBtn = document.getElementById('corridor-toggle-fab');
            if (!corridorBtn) return;
            if (document.getElementById('road-draw-fab')) { clearInterval(interval); return; }
            clearInterval(interval);

            var btn = document.createElement('button');
            btn.id        = 'road-draw-fab';
            btn.innerHTML = '&#9998; Draw road';
            btn.title     = 'Draw a line to assess potential development impact';
            // Copy corridor button's computed style properties manually
            btn.style.cssText =
                'display:block;margin-top:6px;padding:8px 14px;' +
                'background:#8B1A1A;color:white;border:none;border-radius:4px;' +
                'font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;' +
                'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
                'transition:background 0.15s;';
            btn.addEventListener('mouseover', function () {
                if (!drawActive) btn.style.background = '#6b1414';
            });
            btn.addEventListener('mouseout', function () {
                if (!drawActive) btn.style.background = '#8B1A1A';
            });
            btn.addEventListener('click', onFabClick);
            corridorBtn.parentNode.insertBefore(btn, corridorBtn.nextSibling);
        }, 400);
    }

    // ── Get map reference ─────────────────────────────────────────────────────
    function getMap() {
        if (mapRef) return mapRef;
        if (window._mapInstance) { mapRef = window._mapInstance; return mapRef; }
        return null;
    }

    // ── FAB click handler ─────────────────────────────────────────────────────
    function onFabClick() {
        var btn = document.getElementById('road-draw-fab');
        var map = getMap();
        if (!map) return;

        if (drawActive) {
            // Cancel or clear
            cancelDraw(btn);
            return;
        }

        if (!scriptsLoaded) {
            btn.innerHTML = '&#9203; Loading&#8230;';
            btn.disabled  = true;
            loadDeps(function () {
                scriptsLoaded = true;
                btn.disabled  = false;
                startDraw(btn, map);
            });
        } else {
            startDraw(btn, map);
        }
    }

    // ── Load CSS + JS dependencies ────────────────────────────────────────────
    function loadDeps(cb) {
        // CSS
        if (!document.querySelector('link[href="' + DRAW_CSS + '"]')) {
            var lnk  = document.createElement('link');
            lnk.rel  = 'stylesheet';
            lnk.href = DRAW_CSS;
            document.head.appendChild(lnk);
        }
        // MapboxDraw JS
        loadScript(DRAW_JS, function () {
            // Turf JS
            loadScript(TURF_JS, cb);
        });
    }

    function loadScript(src, cb) {
        var s    = document.createElement('script');
        s.src    = src;
        s.onload = cb;
        s.onerror = function () { console.warn('Road tool: failed to load', src); cb(); };
        document.head.appendChild(s);
    }

    // ── Start drawing ─────────────────────────────────────────────────────────
    function startDraw(btn, map) {
        if (!window.MapboxDraw) {
            console.warn('Road tool: MapboxDraw not available');
            return;
        }

        // Create fresh draw instance and add to map
        drawInstance = new MapboxDraw({
            displayControlsDefault: false,
            controls: {},
            styles: [
                {
                    id: 'road-draw-line',
                    type: 'line',
                    filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
                    paint: { 'line-color': '#ff4444', 'line-width': 3, 'line-dasharray': [4, 2] }
                },
                {
                    id: 'road-draw-vertex',
                    type: 'circle',
                    filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']],
                    paint: { 'circle-radius': 5, 'circle-color': '#ff4444', 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' }
                }
            ]
        });

        map.addControl(drawInstance);
        drawInstance.changeMode('draw_line_string');
        drawActive = true;

        btn.innerHTML        = '&#10006; Cancel drawing';
        btn.style.background = '#555';

        // Listen for line completion
        map.once('draw.create', function (e) {
            drawActive = false;
            btn.innerHTML        = '&#9998; Redraw';
            btn.style.background = '#8B1A1A';
            analyseRoad(e.features[0], map);
        });

        showDrawingHint();
    }

    // ── Cancel / clear draw ───────────────────────────────────────────────────
    function cancelDraw(btn) {
        var map = getMap();
        if (drawInstance && map) {
            try { map.removeControl(drawInstance); } catch(e) {}
            drawInstance = null;
        }
        drawActive           = false;
        btn.innerHTML        = '&#9998; Draw road';
        btn.style.background = '#8B1A1A';
        clearSidebar();
    }

    function clearSidebar() {
        var el = document.getElementById('patch-info-content');
        if (el) el.innerHTML = 'Select a patch on the map to see details.';
    }

    // ── Hint while drawing ────────────────────────────────────────────────────
    function showDrawingHint() {
        var el = document.getElementById('patch-info-content');
        if (!el) return;
        el.innerHTML =
            '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">' +
            '<div style="background:#8B1A1A;color:#fff;padding:6px 10px;border-radius:3px;' +
            'font-weight:700;margin-bottom:10px;font-size:0.82em">&#9998; DEVELOPMENT LINE TOOL</div>' +
            '<p style="font-size:0.87em;line-height:1.5;margin:0 0 8px">' +
            'Click on the map to draw a line simulating a road or development corridor. ' +
            'Double-click to finish and see the analysis.</p>' +
            '<p style="font-size:0.82em;color:#888;font-style:italic;margin:0">' +
            'Results will appear here once the line is complete.</p></div>';
        openSidebar();
    }

    function openSidebar() {
        var sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('collapsed'))
            document.getElementById('toggle-sidebar-btn').click();
        var panel = document.getElementById('info-panel-section');
        if (panel) setTimeout(function () { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
    }

    // ── Analysis ──────────────────────────────────────────────────────────────
    function analyseRoad(lineFeature, map) {
        var el = document.getElementById('patch-info-content');
        if (!el) return;
        el.innerHTML = '<div style="padding:6px;font-size:0.87em">Analysing&#8230;</div>';

        if (!window.turf) {
            el.innerHTML = '<div style="padding:6px;color:red;font-size:0.87em">Analysis library failed to load. Please try again.</div>';
            return;
        }

        var lineGeoJSON = { type: 'Feature', geometry: lineFeature.geometry };

        // Query visible patches
        var patchFeatures = [];
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
            if (pl) patchFeatures = map.queryRenderedFeatures({ layers: [pl.id] });
        } catch(e) {}

        // Query visible corridors
        var corrFeatures = [];
        try { corrFeatures = map.queryRenderedFeatures({ layers: ['connector-solid'] }); } catch(e) {}

        // Patches directly intersected
        var intersectedPatches = [];
        patchFeatures.forEach(function (f) {
            try {
                if (turf.booleanIntersects(lineGeoJSON, f)) intersectedPatches.push(f.properties);
            } catch(e) {}
        });

        // Corridors severed
        var severedCorridors = [];
        corrFeatures.forEach(function (f) {
            try {
                var pts = turf.lineIntersect(lineGeoJSON, { type: 'Feature', geometry: f.geometry });
                if (pts.features.length > 0) severedCorridors.push(f.properties);
            } catch(e) {}
        });

        // Patches losing all corridor connections
        var patchCorridorMap = {};
        corrFeatures.forEach(function (f) {
            var p = f.properties; if (!p) return;
            var key = p.id_from + '_' + p.id_to;
            [p.id_from, p.id_to].forEach(function (pid) {
                if (pid == null) return;
                if (!patchCorridorMap[pid]) patchCorridorMap[pid] = [];
                patchCorridorMap[pid].push(key);
            });
        });
        var severedKeys = {};
        severedCorridors.forEach(function (p) { severedKeys[p.id_from + '_' + p.id_to] = true; });

        var isolatedPatches = [];
        Object.keys(patchCorridorMap).forEach(function (pid) {
            var all = patchCorridorMap[pid];
            var remaining = all.filter(function (k) { return !severedKeys[k]; });
            if (remaining.length === 0) {
                var pf = patchFeatures.find(function (f) {
                    return String(f.properties && f.properties.id) === String(pid);
                });
                if (pf) isolatedPatches.push(pf.properties);
            }
        });

        // Helpers
        var TIER_DISPLAY_MAP = {
            'Tier 1 (Core Habitat)':              'Primary forest',
            'Tier 2 (Major Stepping Stones)':     'Established forest',
            'Tier 3 (Connected Fragments)':       'Functional fragment',
            'Tier 4 (Vulnerable Edge Fragments)': 'Vulnerable fragment',
            'Tier 5 (Isolated Fragments)':        'Marginal fragment',
            'Tier 6 (Isolated Micro Patches)':    'Remnant patch'
        };
        function tierLabel(t) {
            return (typeof TIER_DISPLAY_NAMES !== 'undefined' && TIER_DISPLAY_NAMES[t]) || TIER_DISPLAY_MAP[t] || t || 'Unknown';
        }
        function countByTier(arr) {
            var c = {};
            arr.forEach(function (p) { var t = p.Tier || p.tier || 'Unknown'; c[t] = (c[t] || 0) + 1; });
            return c;
        }
        function countByConn(arr) {
            var c = { High: 0, Moderate: 0, Low: 0 };
            arr.forEach(function (p) { if (c[p.connectivity] !== undefined) c[p.connectivity]++; });
            return c;
        }

        var patchTiers = countByTier(intersectedPatches);
        var isolTiers  = countByTier(isolatedPatches);
        var corrCounts = countByConn(severedCorridors);

        var CONN_C = { High: '#00ffff', Moderate: '#ffff00', Low: '#ff3300' };
        var CONN_T = { High: '#000',    Moderate: '#000',     Low: '#fff'   };
        function badge(txt, bg, fg) {
            return '<span style="display:inline-block;padding:1px 8px;border-radius:3px;background:' +
                   bg + ';color:' + fg + ';font-size:0.82em;font-weight:700;margin-right:4px">' + txt + '</span>';
        }

        // ── Build HTML ────────────────────────────────────────────────────────
        var s = '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:0.87em">';

        s += '<div style="background:#8B1A1A;color:#fff;padding:6px 10px;border-radius:3px;' +
             'font-weight:700;margin-bottom:10px;font-size:0.82em">&#9998; DEVELOPMENT LINE ANALYSIS</div>';

        // Disclaimer
        s += '<div style="background:#fff8e1;border:1px solid #f0c040;border-radius:4px;' +
             'padding:8px 10px;margin-bottom:12px;font-size:0.81em;line-height:1.5;color:#5a4000">' +
             '<strong>&#9888; Indicative only.</strong> Results are based on patches and corridors ' +
             'visible in the current map view. This is not a formal environmental impact assessment ' +
             'and must not be used for planning or regulatory purposes.</div>';

        // Corridors severed
        s += '<div style="font-weight:700;margin-bottom:4px">Potential corridors severed: <strong>' +
             severedCorridors.length + '</strong></div>';
        if (severedCorridors.length > 0) {
            s += '<div style="margin-bottom:12px">';
            ['High','Moderate','Low'].forEach(function (c) {
                if (corrCounts[c] > 0) s += badge(corrCounts[c] + '\u00a0' + c, CONN_C[c], CONN_T[c]);
            });
            s += '</div>';
        } else {
            s += '<p style="color:#888;font-style:italic;margin:0 0 12px">No visible corridors intersected.</p>';
        }

        // Patches directly intersected
        s += '<div style="font-weight:700;margin-bottom:4px">Forest patches directly intersected: <strong>' +
             intersectedPatches.length + '</strong></div>';
        if (intersectedPatches.length > 0) {
            s += '<ul style="margin:0 0 12px;padding-left:16px;line-height:1.8">';
            Object.keys(patchTiers).sort().forEach(function (t) {
                s += '<li>' + patchTiers[t] + '\u00d7 ' + tierLabel(t) + '</li>';
            });
            s += '</ul>';
        } else {
            s += '<p style="color:#888;font-style:italic;margin:0 0 12px">No visible patches directly intersected.</p>';
        }

        // Patches losing all corridors
        s += '<div style="font-weight:700;margin-bottom:4px">Patches losing all visible corridor connections: <strong>' +
             isolatedPatches.length + '</strong></div>';
        if (isolatedPatches.length > 0) {
            s += '<ul style="margin:0 0 8px;padding-left:16px;line-height:1.8">';
            Object.keys(isolTiers).sort().forEach(function (t) {
                s += '<li>' + isolTiers[t] + '\u00d7 ' + tierLabel(t) + '</li>';
            });
            s += '</ul>';
            if (isolTiers['Tier 1 (Core Habitat)'] || isolTiers['Tier 2 (Major Stepping Stones)']) {
                s += '<div style="background:#fdecea;border:1px solid #f5c6cb;border-radius:4px;' +
                     'padding:6px 10px;font-size:0.82em;line-height:1.5;color:#721c24;margin-bottom:8px">' +
                     '<strong>Note:</strong> One or more Primary or Established forest patches would lose ' +
                     'all visible corridor connections, significantly increasing their functional isolation.</div>';
            }
        } else {
            s += '<p style="color:#888;font-style:italic;margin:0 0 8px">No patches would lose all corridor connections.</p>';
        }

        // Close button
        s += '<button id="road-clear-btn" style="display:block;width:100%;margin-top:6px;padding:7px 10px;' +
             'background:#555;color:white;border:none;border-radius:4px;font-size:12px;font-weight:600;' +
             'cursor:pointer;font-family:inherit">&#215; Clear line &amp; close</button>';
        s += '</div>';

        el.innerHTML = s;

        document.getElementById('road-clear-btn').addEventListener('click', function () {
            var map2 = getMap();
            if (drawInstance && map2) {
                try { map2.removeControl(drawInstance); } catch(e) {}
                drawInstance = null;
            }
            drawActive = false;
            var fab = document.getElementById('road-draw-fab');
            if (fab) { fab.innerHTML = '&#9998; Draw road'; fab.style.background = '#8B1A1A'; }
            clearSidebar();
        });

        openSidebar();
    }

    // ── Boot ─────────────────────────────────────────────────────────────────
    if (document.readyState !== 'loading') { injectFab(); }
    else { document.addEventListener('DOMContentLoaded', injectFab); }

})();
