export type MapPoint = { latitude: number; longitude: number; accuracy?: number | null };
export type TrackingMapProps = { point: MapPoint | null };

// No identity, job data or credentials enter the map document.
export const mapDocument = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0;background:#e7ebdf}#status{position:absolute;z-index:1000;top:12px;left:50%;transform:translateX(-50%);background:white;color:#1f241a;border-radius:12px;padding:10px;font:13px sans-serif;max-width:65%}.provider{background:#b9df35;border:3px solid #1f241a;border-radius:50%;width:22px;height:22px;box-shadow:0 0 0 8px #b9df3533}.leaflet-control-attribution{font-size:10px}</style>
</head><body><div id="map"></div><div id="status">Loading map...</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const status=document.getElementById('status');
if(!window.L){status.textContent='Map unavailable. Check your internet connection.';}
else {
const map=L.map('map').setView([6.5244,3.3792],11);
const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
let marker=null,circle=null,first=true;
status.textContent='Waiting for a shared location';
tiles.on('tileerror',()=>{status.style.display='block';status.textContent='Map tiles unavailable. Check your connection.';});
window.updatePoint=function(point){
 if(!point){if(marker)map.removeLayer(marker);if(circle)map.removeLayer(circle);marker=null;circle=null;first=true;status.style.display='block';status.textContent='Waiting for a shared location';return;}
 if(!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude))return;
 const ll=[point.latitude,point.longitude];
 if(!marker){marker=L.marker(ll,{icon:L.divIcon({className:'provider',iconSize:[22,22],iconAnchor:[11,11]}),title:'Provider location'}).addTo(map);circle=L.circle(ll,{radius:point.accuracy||0,color:'#506600',weight:1,fillOpacity:0.1}).addTo(map);}
 else{marker.setLatLng(ll);circle.setLatLng(ll).setRadius(point.accuracy||0);}
 if(first){map.setView(ll,16);first=false;}else{map.panTo(ll);}
 status.style.display='none';
};
window.addEventListener('message',event=>{if(event.source===parent&&event.data&&event.data.type==='handyskillz-location')window.updatePoint(event.data.point);});
if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage('ready');
else parent.postMessage({type:'handyskillz-map-ready'},'*');
}
</script></body></html>`;
