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

        // ── Canvas: 920x780 at 2x (larger canvas for bigger text) ─────────────
        var W=920,H=780,SC=2;
        var cv=document.createElement('canvas');
        cv.width=W*SC;cv.height=H*SC;
        var ctx=cv.getContext('2d');ctx.scale(SC,SC);

        // ── Layout ────────────────────────────────────────────────────────────
        var PAD=22,C1W=220,C2X=PAD+C1W+16,C2W=W-C2X-PAD;
        var HH=96,PLY=HH+10,BY=PLY+38,SPY=BY+72,CTY=SPY+46;
        var FY=H-56,AV=FY-CTY,SHH=210,QY=CTY+SHH+12,QH=FY-QY;
        var QS=Math.min(QH-44,C1W-28),mC=2,mG=12;
        var mW=Math.floor((C2W-mG)/mC),mH=Math.floor((AV-mG*2)/3);

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
        if(p.id!=null){
            ctx.fillStyle=WH;ctx.font=F(11);
            var idT='PATCH #'+p.id;
            ctx.fillText(idT,W-PAD-ctx.measureText(idT).width,62);
        }

        // forest name strip
        ctx.fillStyle=D;ctx.fillRect(PAD,PLY,W-PAD*2,32);
        ctx.strokeStyle=L;ctx.lineWidth=1;ctx.strokeRect(PAD,PLY,W-PAD*2,32);
        var pn=forestName?'[ '+forestName+' ]':'[ LOCATION DATA UNAVAILABLE ]';
        ctx.fillStyle=B;ctx.font=F(11);
        while(ctx.measureText(pn).width>W-PAD*2-24&&pn.length>10)pn=pn.slice(0,-2)+'...]';
        ctx.fillText(pn,PAD+12,PLY+22);

        // tier badge — full published name, no redundant label
        ctx.fillStyle=M;ctx.fillRect(PAD,BY,330,58);
        ctx.strokeStyle=B;ctx.lineWidth=2;ctx.strokeRect(PAD,BY,330,58);
        var tfs=13;ctx.font=F(tfs);
        while(ctx.measureText(tierLbl).width>310&&tfs>8){tfs--;ctx.font=F(tfs);}
        ctx.fillStyle=B;ctx.fillText(tierLbl,PAD+12,BY+36);

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
        if(lat&&lng){
            ctx.fillText(lat.toFixed(5)+'N',GX+12,BY+40);
            ctx.fillText(lng.toFixed(5)+'E',GX+12+Math.floor((W-GX-PAD)/2),BY+40);
        }else{ctx.fillText('UNAVAILABLE',GX+12,BY+40);}

        // spectrum bar
        var sW=Math.floor((W-PAD*2)/6);
        for(var si=0;si<6;si++){
            var sx=PAD+si*sW;
            ctx.fillStyle=TIER_SEG[si];ctx.fillRect(sx,SPY,sW,26);
            if(si===ti){ctx.strokeStyle=B;ctx.lineWidth=3;ctx.strokeRect(sx+1,SPY+1,sW-2,24);}
            ctx.fillStyle=si<2?D:B;ctx.font=F(9);
            var tc=TIER_CODE[si];
            ctx.fillText(tc,sx+sW/2-ctx.measureText(tc).width/2,SPY+17);
        }
        if(ti>=0){
            var px=PAD+ti*sW+sW/2;
            ctx.fillStyle=B;ctx.beginPath();
            ctx.moveTo(px-9,SPY+28);ctx.lineTo(px+9,SPY+28);ctx.lineTo(px,SPY+40);
            ctx.closePath();ctx.fill();
        }

        // shape panel
        ctx.fillStyle=D;ctx.fillRect(PAD,CTY,C1W,SHH);
        ctx.strokeStyle=L;ctx.lineWidth=2;ctx.strokeRect(PAD,CTY,C1W,SHH);
        pxC(ctx,PAD,CTY,C1W,SHH,9,B);
        ctx.fillStyle=L;ctx.font=F(10);ctx.fillText('[ SHAPE ]',PAD+14,CTY+20);
        if(geometry){drawShape(ctx,geometry,PAD+10,CTY+32,C1W-20,SHH-44,M,B);}
        else{ctx.fillStyle=M;ctx.font=F(10);ctx.fillText('N/A',PAD+80,CTY+SHH/2);}

        // QR panel — user's wording preserved
        ctx.fillStyle=D;ctx.fillRect(PAD,QY,C1W,QH);
        ctx.strokeStyle=L;ctx.lineWidth=2;ctx.strokeRect(PAD,QY,C1W,QH);
        pxC(ctx,PAD,QY,C1W,QH,9,B);
        ctx.fillStyle=L;ctx.font=F(10);ctx.fillText('[ SCAN TO VIEW',PAD+14,QY+20);
        ctx.fillText('  ON PLATFORM ]',PAD+14,QY+36);

        // metric cards
        var nv=function(v){return v!=null?parseFloat(v):null;};
        var mets=[
            {l:'TOTAL AREA', v:nv(p.area)     !=null?nv(p.area).toFixed(2)    :'--',u:'HA'},
            {l:'CORE AREA',  v:nv(p.core)     !=null?nv(p.core).toFixed(2)    :'--',u:'HA'},
            {l:'CONTIGUITY', v:nv(p.contig)   !=null?nv(p.contig).toFixed(3)  :'--',u:'0-1'},
            {l:'ENN DIST',   v:nv(p.enn)      !=null?Math.round(nv(p.enn))+'' :'--',u:'M'},
            {l:'PARA RATIO', v:nv(p.para)     !=null?nv(p.para).toFixed(5)    :'--',u:''},
            {l:'MEAN FLOW',  v:nv(p.mean_flow)!=null?nv(p.mean_flow).toFixed(2):'--',u:''}
        ];
        mets.forEach(function(m,i){
            var col=i%mC,row=Math.floor(i/mC);
            var mx=C2X+col*(mW+mG),my=CTY+row*(mH+mG);
            ctx.fillStyle=D;ctx.fillRect(mx,my,mW,mH);
            ctx.strokeStyle=L;ctx.lineWidth=1;ctx.strokeRect(mx,my,mW,mH);
            pxC(ctx,mx,my,mW,mH,7,M);
            // label
            ctx.fillStyle=L;ctx.font=F(11);ctx.fillText(m.l,mx+12,my+22);
            // value — auto-fit
            var vfs=20;ctx.font=F(vfs);
            while(ctx.measureText(m.v).width>mW-24&&vfs>11){vfs--;ctx.font=F(vfs);}
            ctx.fillStyle=B;ctx.fillText(m.v,mx+12,my+Math.floor(mH/2)+12);
            // unit — bright white, clearly readable
            if(m.u){ctx.fillStyle=WH;ctx.font=F(13);ctx.fillText(m.u,mx+12,my+mH-16);}
        });

        // footer
        function drawFooter(){
            ctx.fillStyle=M;ctx.fillRect(0,FY,W,H-FY);
            ctx.fillStyle=B;ctx.fillRect(0,FY,W,3);
            ctx.fillStyle=B;ctx.font=F(10);
            var dd=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}).toUpperCase();
            ctx.fillText('> GENERATED '+dd,PAD,FY+26);
            ctx.fillStyle=D;ctx.font=F(10);
            var dis='FOR REFERENCE ONLY';
            ctx.fillText(dis,W-PAD-ctx.measureText(dis).width,FY+26);
        }

        // load QR then download
        var qi=new Image();qi.crossOrigin='anonymous';
        qi.onload=function(){
            var qx=PAD+Math.floor((C1W-QS)/2),qy=QY+44;
            ctx.drawImage(qi,qx,qy,QS,QS);
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
