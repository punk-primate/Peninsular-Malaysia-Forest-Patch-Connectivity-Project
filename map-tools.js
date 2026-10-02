/* Exploration, comparison, measurements and export for both maps. */
(function () {
'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const map=window._mapInstance, explorer=window._forestExplorer;
 if(!map||!explorer)return;
 const get=id=>document.getElementById(id), dataset=location.pathname.includes('kuantan')?'kuantan':'klang-valley';
 let selected=null, mode=null, points=[], measurement=null, visibleCount=null, turfPromise=null;
 const comparisons=new Map();let markers=[];
 window._mapTools={get measuring(){return !!mode;},get measurement(){return measurement;},get comparisonCount(){return comparisons.size;}};
 function section(id,title,html){
  const el=document.createElement('details');el.id=id;el.className='sidebar-section map-tool-section';
  const summary=document.createElement('summary');summary.textContent=title;el.append(summary);
  const body=document.createElement('div');body.className='map-tool-body';body.innerHTML=html;el.append(body);
  get('sidebar').insertBefore(el,get('sidebar-footer'));return el;
 }
 const comparePanel=section('patch-comparison','Compare patches','<p>Select a patch, then use Add to comparison in its details. Compare up to three patches. Numbered markers identify them on the map.</p><div id="patch-comparison-table"></div><button id="comparison-clear" disabled>Clear comparison</button><p id="comparison-status" role="status" aria-live="polite"></p>');
 section('measurement-tools','Measure and export','<p>Measure a gap, path or site directly on the map.</p><div class="map-tool-row"><button id="measure-distance">Measure distance</button><button id="measure-area">Measure area</button></div><p id="measurement-status" role="status" aria-live="polite">Choose a measurement tool to begin.</p><div class="map-tool-row"><button id="measure-finish" hidden>Finish measurement</button><button id="measure-clear" disabled>Clear measurement</button></div><button id="map-export" class="map-tool-primary">Download map PNG</button><p id="map-export-status" role="status" aria-live="polite"></p>');
 const filters=document.createElement('div');filters.id='active-filter-summary';filters.className='map-tool-body';
 filters.innerHTML='<p id="active-filters-text"></p><p id="filter-empty-status" role="status" aria-live="polite"></p><button id="filters-reset-all">Reset all filters</button>';
 get('filter-section').after(filters);
 function escape(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function label(tier){return TIER_DISPLAY_NAMES[tier]||tier;}
 function format(value,digits=2){const n=Number.parseFloat(value);return Number.isFinite(n)?n.toLocaleString('en-GB',{maximumFractionDigits:digits}):'Not available';}
 function ensureTurf(){
  if(window.turf)return Promise.resolve(window.turf);
  if(!turfPromise)turfPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/turf-6.5.0.min.js';script.onload=()=>resolve(window.turf);script.onerror=()=>{turfPromise=null;script.remove();reject(Error('Could not load measurement tools. Please try again.'));};document.head.append(script);});
  return turfPromise;
 }
  function measurementData(){
  const features=points.map(c=>({type:'Feature',properties:{},geometry:{type:'Point',coordinates:c}}));
  if(points.length>=2){const area=(mode==='area'||measurement?.type==='area')&&points.length>=3;features.push({type:'Feature',properties:{},geometry:{type:area?'Polygon':'LineString',coordinates:area?[points.concat([points[0]])]:points}});}
  return {type:'FeatureCollection',features};
 }
 function ensureLayers(){
  if(!map.isStyleLoaded())return;
  const data=measurementData();if(!map.getSource('utility-measurement'))map.addSource('utility-measurement',{type:'geojson',data});else map.getSource('utility-measurement').setData(data);
  const layers=[
   {id:'utility-measure-area',type:'fill',source:'utility-measurement',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#007f86','fill-opacity':.2}},
   {id:'utility-measure-line',type:'line',source:'utility-measurement',filter:['!=',['geometry-type'],'Point'],paint:{'line-color':'#007f86','line-width':4}},
   {id:'utility-measure-points',type:'circle',source:'utility-measurement',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':5,'circle-color':'#fff','circle-stroke-color':'#007f86','circle-stroke-width':2}}
  ];for(const layer of layers)if(!map.getLayer(layer.id))map.addLayer(layer);
 }
 document.addEventListener('forestconnect:patch-selected',event=>{
  selected={properties:{...event.detail},coordinate:window._lastPatchLngLat?window._lastPatchLngLat.toArray():map.getCenter().toArray()};
  const button=document.createElement('button');button.id='patch-compare-add';button.textContent='Add to comparison';button.className='map-tool-primary';
  button.addEventListener('click',()=>{
   const id=String(selected.properties[PATCH_ID_ATTRIBUTE]);comparePanel.open=true;
   if(comparisons.has(id)){get('comparison-status').textContent='This patch is already in the comparison.';return;}
   if(comparisons.size>=3){get('comparison-status').textContent='Compare up to three patches. Remove one to add another.';return;}
   comparisons.set(id,selected);renderComparison();get('comparison-status').textContent='Patch added.';comparePanel.scrollIntoView({behavior:'smooth',block:'start'});
  });get('patch-info-content').append(button);
 });
 function updateMarkers(){
  markers.forEach(m=>m.remove());markers=[];if(window._developmentScenario?.active)return;
  [...comparisons.values()].forEach((entry,i)=>{const el=document.createElement('div');el.className='comparison-marker';el.textContent=i+1;el.setAttribute('aria-label','Comparison patch '+(i+1));markers.push(new mapboxgl.Marker({element:el}).setLngLat(entry.coordinate).addTo(map));});
 }
 function renderComparison(){
  const entries=[...comparisons];get('comparison-clear').disabled=!entries.length;updateMarkers();
  if(!entries.length){get('patch-comparison-table').textContent='No patches selected.';return;}
  const metrics=[['Tier',TIER_ATTRIBUTE,null],['Forest area (ha)',PATCH_AREA_ATTRIBUTE,2],['Core area (ha)',CORE_AREA_ATTRIBUTE,2],['Nearest patch (m)',ENN_ATTRIBUTE,0],['Contiguity',CONTIGUITY_INDEX_ATTRIBUTE,3],['Perimeter / area',PERIMETER_AREA_RATIO_ATTRIBUTE,5],['Mean composite flow',MEAN_FLOW_ATTRIBUTE,2],['Canopy height (m)','canopy_height_m',1],['Elevation (m)','elevation_m',1],['Slope (°)','slope_deg',2],['Biomass (Mg/ha)','biomass_mgha',1]];
  let html='<div class="comparison-scroll" tabindex="0" aria-label="Scrollable patch comparison"><table><caption>Selected patch attributes</caption><thead><tr><th scope="col">Attribute</th>';
  html+=entries.map(([id],i)=>'<th scope="col">Patch '+(i+1)+'<button data-show-patch="'+escape(id)+'">Show on map</button><button data-remove-patch="'+escape(id)+'" aria-label="Remove comparison patch '+(i+1)+'">Remove</button></th>').join('')+'</tr></thead><tbody>';
  for(const [name,key,digits] of metrics)html+='<tr><th scope="row">'+name+'</th>'+entries.map(([,entry])=>'<td>'+escape(digits===null?(entry.properties[key]?label(entry.properties[key]):'Not available'):format(entry.properties[key],digits))+'</td>').join('')+'</tr>';
  get('patch-comparison-table').innerHTML=html+'</tbody></table></div>';
  get('patch-comparison-table').querySelectorAll('[data-remove-patch]').forEach(button=>button.addEventListener('click',()=>{comparisons.delete(button.dataset.removePatch);renderComparison();get('comparison-status').textContent='Patch removed.';}));
  get('patch-comparison-table').querySelectorAll('[data-show-patch]').forEach(button=>button.addEventListener('click',()=>map.flyTo({center:comparisons.get(button.dataset.showPatch).coordinate,zoom:Math.max(map.getZoom(),15)})));
 }
 get('comparison-clear').addEventListener('click',()=>{comparisons.clear();renderComparison();get('comparison-status').textContent='Comparison cleared.';});renderComparison();
 function filterText(){const f=explorer.filters;return (f.tiers.length===ALL_TIERS.length?'All tiers':f.tiers.length?f.tiers.map(t=>'Tier '+(ALL_TIERS.indexOf(t)+1)).join(', '):'No tiers selected')+'; '+(f.min===null&&f.max===null?'no area limits':(f.min===null?'0':f.min)+' to '+(f.max===null?'any':f.max)+' ha');}
 function updateFilters(){
  get('active-filters-text').textContent='Active filters: '+filterText()+'.';
  get('filter-empty-status').textContent=window._developmentScenario?.active?'':!map.getLayer(explorer.layerId)?'Forest filters are available on the custom basemap.':!explorer.filters.tiers.length?'No tiers selected. Select a tier or reset filters.':map.getZoom()<11?'Zoom in to see matching forest patches.':visibleCount===0?'No matching patches visible here. Move the map or reset filters.':'';
 }
 get('filters-reset-all').addEventListener('click',()=>{explorer.resetFilters();updateFilters();});
 document.addEventListener('forestconnect:filters',updateFilters);
 document.addEventListener('forestconnect:visible-patches',event=>{visibleCount=event.detail.count;updateFilters();});
 async function startMeasure(type){
  if(window._developmentScenario?.active||window._connectivityExplorer?.active)return;
  try{await ensureTurf();if(window._developmentScenario?.active)return;mode=type;points=[];measurement=null;ensureLayers();get('measure-finish').hidden=false;get('measure-clear').disabled=false;
   get('measurement-status').textContent=type==='distance'?'Click or tap along the path. Place at least two points, then Finish measurement.':'Click or tap around the boundary. Place at least three corners, then Finish measurement.';window._forestMapInteraction.refresh();
  }catch(error){get('measurement-status').textContent=error.message;}
 }
 function clearMeasurement(){mode=null;points=[];measurement=null;ensureLayers();get('measure-finish').hidden=true;get('measure-clear').disabled=true;get('measurement-status').textContent='Measurement cleared. Choose a tool to start again.';window._forestMapInteraction.refresh();}
 function finishMeasurement(){
  if(!mode)return;const minimum=mode==='distance'?2:3;
  if(points.length<minimum){get('measurement-status').textContent='Place at least '+minimum+' points before finishing.';return;}
  if(mode==='area'){
   const polygon=turf.polygon([points.concat([points[0]])]);if(turf.kinks(polygon).features.length){get('measurement-status').textContent='The boundary crosses itself. Clear measurement and draw around the site in order.';return;}
   measurement={type:mode,value:turf.area(polygon)/10000,unit:'ha'};
  }else measurement={type:mode,value:turf.length(turf.lineString(points),{units:'kilometers'})*1000,unit:'m'};
  mode=null;get('measure-finish').hidden=true;ensureLayers();
  const display=measurement.unit==='m'&&measurement.value>=1000?format(measurement.value/1000)+' km':format(measurement.value)+' '+measurement.unit;
  get('measurement-status').textContent=(measurement.type==='area'?'Area: ':'Distance: ')+display+'. Map measurement without terrain adjustment.';window._forestMapInteraction.refresh();
 }
 get('measure-distance').addEventListener('click',()=>startMeasure('distance'));get('measure-area').addEventListener('click',()=>startMeasure('area'));get('measure-finish').addEventListener('click',finishMeasurement);get('measure-clear').addEventListener('click',clearMeasurement);
 map.on('click',event=>{if(!mode)return;event.forestToolClick=true;const coordinate=[event.lngLat.lng,event.lngLat.lat];if(points.length&&coordinate.every((v,i)=>v===points[points.length-1][i]))return;points.push(coordinate);ensureLayers();});
 document.addEventListener('keydown',event=>{if(!mode||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;if(event.key==='Enter'&&event.target.tagName!=='BUTTON'){event.preventDefault();finishMeasurement();}if(event.key==='Escape'){event.preventDefault();clearMeasurement();}});
 function syncOwnership(){
  const development=!!window._developmentScenario?.active;
  if(development&&mode)clearMeasurement();
  get('filters-reset-all').disabled=development||!!mode;
  for(const id of ['measure-distance','measure-area'])get(id).disabled=development||!!window._connectivityExplorer?.active;
  get('patch-comparison').hidden=development;get('active-filter-summary').hidden=development;
  if(development){points=[];measurement=null;ensureLayers();get('measure-clear').disabled=true;get('measurement-status').textContent='Return to patch explorer to measure.';}
  if(!development&&!mode&&!measurement)get('measurement-status').textContent='Choose a measurement tool to begin.';
  updateMarkers();updateFilters();
 }
 document.addEventListener('forestconnect:interaction',syncOwnership);
 map.on('style.load',()=>{ensureLayers();updateFilters();});map.on('zoomend',updateFilters);
 map.once('load',()=>{map.addControl(new mapboxgl.ScaleControl({maxWidth:100,unit:'metric'}),'bottom-left');ensureLayers();updateFilters();});
 get('map-export').addEventListener('click',async()=>{
  const button=get('map-export');button.disabled=true;get('map-export-status').textContent='Preparing map image…';
  try{
   if(mode)throw Error('Finish or clear your measurement before downloading the map.');
   if(!map.isStyleLoaded()||map.isMoving())throw Error('Wait for the map to finish loading or moving, then download again.');
   const image=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{map.off('render',capture);reject(Error('Map capture timed out. Please try again.'));},15000);
    function capture(){clearTimeout(timer);try{const canvas=document.createElement('canvas');canvas.width=map.getCanvas().width;canvas.height=map.getCanvas().height;canvas.getContext('2d').drawImage(map.getCanvas(),0,0);resolve(canvas);}catch(error){reject(error);}}
    map.once('render',capture);map.triggerRepaint();
   });
   const legends=[];
   if(window._developmentScenario?.footprint){legends.push(['#2a8234','Mapped forest']);if(window._developmentScenario.view==='scenario')legends.push(['#d44532','Cleared forest']);legends.push(['#b56804','Development footprint']);}
   else if(map.getLayer(explorer.layerId))for(const tier of explorer.filters.tiers)legends.push([TIER_COLORS[tier],label(tier)]);
   const routeLegend=get('connection-map-legend');if(routeLegend&&!routeLegend.hidden){const text=routeLegend.textContent;if(text.includes('Before development'))legends.push(['#7946bf','Potential route before development (dashed)']);if(text.includes('With development'))legends.push(['#d25b05','Potential route with development']);if(text.includes('Baseline high-flow'))legends.push(['#2563eb','Baseline high-flow areas']);}
   if(measurement)legends.push(['#007f86','Measurement: '+get('measurement-status').textContent.split('. Map')[0]]);
   const scaleEl=map.getContainer().querySelector('.mapboxgl-ctrl-scale');
   const attribution=[...map.getContainer().querySelectorAll('.mapboxgl-ctrl-attrib-inner')].map(el=>el.textContent.trim()).filter(Boolean).join(' | ')||'© Mapbox © OpenStreetMap';
   const ratio=image.width/map.getContainer().clientWidth;
   const output=document.createElement('canvas');output.width=image.width;
   const margin=20*ratio,font=12*ratio,lineHeight=20*ratio,columns=image.width/ratio>650?2:1;
   const footer=(160+Math.ceil(legends.length/columns)*20)*ratio;output.height=image.height+footer;
   const ctx=output.getContext('2d');ctx.drawImage(image,0,0);
   // DOM comparison markers are drawn separately because they are outside the WebGL canvas.
   if(!window._developmentScenario?.active)[...comparisons.values()].forEach((entry,i)=>{const p=map.project(entry.coordinate),x=p.x*ratio,y=p.y*ratio;ctx.fillStyle='#f1eed5';ctx.strokeStyle='#18382a';ctx.lineWidth=2*ratio;ctx.beginPath();ctx.arc(x,y,14*ratio,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#18382a';ctx.font='bold '+(14*ratio)+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i+1,x,y);});
   const mapBox=map.getContainer().getBoundingClientRect();
   map.getContainer().querySelectorAll('.connection-marker').forEach(el=>{
    const box=el.getBoundingClientRect(),x=(box.x+box.width/2-mapBox.x)*ratio,y=(box.y+box.height/2-mapBox.y)*ratio;
    ctx.fillStyle=getComputedStyle(el).backgroundColor;ctx.beginPath();ctx.arc(x,y,14*ratio,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2*ratio;ctx.stroke();ctx.fillStyle=getComputedStyle(el).color;ctx.font='bold '+(14*ratio)+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(el.textContent,x,y);
   });
   ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle='#f5f3e7';ctx.fillRect(0,image.height,output.width,footer);ctx.fillStyle='#163323';ctx.font='bold '+(16*ratio)+'px Arial';
   let y=image.height+28*ratio;ctx.fillText((dataset==='kuantan'?'Kuantan':'Klang Valley')+' forest map | '+new Date().toLocaleDateString('en-GB'),margin,y);y+=24*ratio;ctx.font=font+'px Arial';
   const view=window._developmentScenario?.footprint?(window._developmentScenario.view==='before'?'Before development':'With development'):'Patch explorer';ctx.fillText('View: '+view,margin,y);y+=22*ratio;
   for(let i=0;i<legends.length;i++){const col=i%columns,row=Math.floor(i/columns),x=margin+col*(image.width/columns);ctx.fillStyle=legends[i][0];ctx.fillRect(x,y+row*lineHeight-10*ratio,12*ratio,12*ratio);ctx.fillStyle='#163323';ctx.fillText(legends[i][1],x+20*ratio,y+row*lineHeight,image.width/columns-45*ratio);}
   y+=Math.ceil(legends.length/columns)*lineHeight+22*ratio;
   const summary=window._developmentScenario?.active?'Development scenario; complete clearance inside the footprint.':'Filters: '+filterText();ctx.fillText(summary,margin,y,image.width-2*margin);y+=20*ratio;ctx.fillText('myforestconnect.online | '+attribution,margin,y,image.width-2*margin);y+=20*ratio;ctx.fillText('Forest data: project patch inventory derived from 2025 land cover.',margin,y,image.width-2*margin);
   if(scaleEl){const width=scaleEl.getBoundingClientRect().width*ratio,x=image.width-width-margin,sy=image.height-24*ratio;ctx.fillStyle='#fff';ctx.fillRect(x-8*ratio,sy-22*ratio,width+16*ratio,32*ratio);ctx.fillStyle='#111';ctx.strokeStyle='#111';ctx.lineWidth=2*ratio;ctx.beginPath();ctx.moveTo(x,sy-5*ratio);ctx.lineTo(x,sy);ctx.lineTo(x+width,sy);ctx.lineTo(x+width,sy-5*ratio);ctx.stroke();ctx.font=font+'px Arial';ctx.fillText(scaleEl.textContent,x,sy-8*ratio);}
   const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not create the image. Please try again.');
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=dataset+'-forest-map.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);get('map-export-status').textContent='Map image downloaded with legend, scale and attribution.';
  }catch(error){get('map-export-status').textContent=error.message;}
  finally{button.disabled=false;}
 });
 updateFilters();
});
})();
