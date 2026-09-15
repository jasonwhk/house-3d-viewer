import fs from 'node:fs';

const mainPath='src/main.js';
const htmlPath='index.html';
let js=fs.readFileSync(mainPath,'utf8');
let html=fs.readFileSync(htmlPath,'utf8');

// DOM hooks
js=js.replace("const mapZoomOut = document.querySelector('#map-zoom-out');", `const mapZoomOut = document.querySelector('#map-zoom-out');
const projectNameInput = document.querySelector('#project-name');
const saveVersionButton = document.querySelector('#save-version');
const downloadProjectButton = document.querySelector('#download-project');
const uploadProjectInput = document.querySelector('#upload-project');
const projectStatus = document.querySelector('#project-status');
const quantitySummary = document.querySelector('#quantity-summary');`);

// project state + geometry helpers
js=js.replace("let outsideGround = null;", `let outsideGround = null;
const PROJECT_SCHEMA='house-renovation-project';
const PROJECT_VERSION=1;
const SNAP_DISTANCE=.18;
let projectMeta={name:localStorage.getItem('house3d-project-name')||'House renovation',savedAt:null};
let jointCounter=1;

function ensureJointModel(){
  const joints=[]; const walls=[];
  const oldWalls=buildItems.filter(x=>x.type==='wall');
  const findOrCreate=(p)=>{const v=new THREE.Vector3(...p);let best=null,dist=Infinity;for(const j of joints){const d=v.distanceTo(new THREE.Vector3(...j.position));if(d<dist){dist=d;best=j;}}if(best&&dist<=SNAP_DISTANCE)return best.id;const id='J'+jointCounter++;joints.push({id,position:v.toArray()});return id;};
  for(const w of oldWalls){walls.push({...w,startJoint:w.startJoint||findOrCreate(w.a),endJoint:w.endJoint||findOrCreate(w.b)});}
  return {joints,walls};
}
function connectedGeometry(){return ensureJointModel();}
function nearestJoint(point){const {joints}=connectedGeometry();let best=null,dist=Infinity;for(const j of joints){const d=point.distanceTo(new THREE.Vector3(...j.position));if(d<dist){dist=d;best=j;}}return dist<=SNAP_DISTANCE?best:null;}
function snapBuildPoint(point){const j=nearestJoint(point);return j?new THREE.Vector3(...j.position):point;}
function wallQuantities(){let length=0,area=0,volume=0,count=0;for(const w of buildItems.filter(x=>x.type==='wall')){const a=new THREE.Vector3(...w.a),b=new THREE.Vector3(...w.b);const l=Math.hypot(b.x-a.x,b.z-a.z),h=w.height||2.5,t=w.thickness||.12;length+=l;area+=l*h;volume+=l*h*t;count++;}return{count,length,area,volume};}
function updateQuantitySummary(){if(!quantitySummary)return;const q=wallQuantities();quantitySummary.innerHTML='<b>'+q.count+'</b> proposed walls · <b>'+q.length.toFixed(2)+' m</b> · <b>'+q.area.toFixed(2)+' m²</b> · '+q.volume.toFixed(2)+' m³';}
function modelFingerprint(){if(!house)return null;const b=new THREE.Box3().setFromObject(house),s=b.getSize(new THREE.Vector3());return s.toArray().map(v=>+v.toFixed(5)).join(':');}
function makeProjectSnapshot(){const geometry=connectedGeometry();return{schema:PROJECT_SCHEMA,schemaVersion:PROJECT_VERSION,meta:{...projectMeta,name:projectNameInput?.value?.trim()||projectMeta.name,savedAt:new Date().toISOString()},baseModel:{path:'models/house-existing.glb.dat',fingerprint:modelFingerprint()},units:'m',coordinateSystem:'Y-up',renovationData,buildItems,joints:geometry.joints,walls:geometry.walls,view:{renovationView,navigationMode,camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray()},orbitTarget:orbitControls.target.toArray()}};}
function downloadJSON(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function saveNamedVersion(){projectMeta.name=projectNameInput?.value?.trim()||'House renovation';projectMeta.savedAt=new Date().toISOString();localStorage.setItem('house3d-project-name',projectMeta.name);localStorage.setItem('house3d-project-version',JSON.stringify(makeProjectSnapshot()));if(projectStatus)projectStatus.textContent='Version saved in this browser · '+new Date().toLocaleTimeString();}
function downloadProject(){const p=makeProjectSnapshot();const safe=(p.meta.name||'house-renovation').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();downloadJSON(p,(safe||'house-renovation')+'.json');if(projectStatus)projectStatus.textContent='Project file downloaded.';}
function clearBuildGeometry(){for(const c of [...buildRoot.children])c.removeFromParent();groundMeshes=groundMeshes.filter(x=>!x.userData.localBuild);walkableMeshes=walkableMeshes.filter(x=>!x.userData.localBuild);collisionMeshes=collisionMeshes.filter(x=>!x.userData.localBuild);}
function importProject(p){if(!p||p.schema!==PROJECT_SCHEMA||p.schemaVersion!==PROJECT_VERSION)throw new Error('Unsupported project file');const fp=modelFingerprint();if(p.baseModel?.fingerprint&&fp&&p.baseModel.fingerprint!==fp&&!confirm('This project was saved against a different base-house geometry. Load anyway?'))return;for(const k of Object.keys(renovationData))delete renovationData[k];Object.assign(renovationData,p.renovationData||{});saveRenovationData();buildItems=Array.isArray(p.buildItems)?p.buildItems:[];saveBuildItems();clearBuildGeometry();restoreBuildItems();projectMeta={name:p.meta?.name||'House renovation',savedAt:p.meta?.savedAt||null};if(projectNameInput)projectNameInput.value=projectMeta.name;setRenovationView(p.view?.renovationView||'combined');updateRenovationCounts();updateQuantitySummary();applyVisibility();if(projectStatus)projectStatus.textContent='Loaded '+projectMeta.name+' · '+buildItems.length+' build objects';}
`);

// snap wall placement + quantity refresh
js=js.replace("if(buildMode==='wall'){createWallItem({a:buildStart.toArray(),b:point.toArray(),baseY:Math.min(buildStart.y,point.y),height:2.5,thickness:.12},true);}", "if(buildMode==='wall'){const a=snapBuildPoint(buildStart),b=snapBuildPoint(point);createWallItem({a:a.toArray(),b:b.toArray(),baseY:Math.min(a.y,b.y),height:2.5,thickness:.12},true);updateQuantitySummary();}");
js=js.replace("saveBuildItems();clearSelection();return true;}", "saveBuildItems();clearSelection();updateQuantitySummary();return true;}");

// UI event wiring
js=js.replace("document.querySelector('#delete-build')?.addEventListener('click',deleteSelectedBuild);", `document.querySelector('#delete-build')?.addEventListener('click',deleteSelectedBuild);
if(projectNameInput)projectNameInput.value=projectMeta.name;
saveVersionButton?.addEventListener('click',saveNamedVersion);
downloadProjectButton?.addEventListener('click',downloadProject);
uploadProjectInput?.addEventListener('change',async()=>{const f=uploadProjectInput.files?.[0];if(!f)return;try{importProject(JSON.parse(await f.text()));}catch(e){if(projectStatus)projectStatus.textContent='Could not load project: '+e.message;}finally{uploadProjectInput.value='';}});`);

// ensure quantities initialize after build restore - safe call in animation setup too
js=js.replace("updateRenovationCounts();\n\nrenovationViewControls", "updateRenovationCounts();\nupdateQuantitySummary();\n\nrenovationViewControls");

// Add construction/project UI before renovation section
const marker=`        <section>\n          <p class="section-title">Renovation view · G cycles</p>`;
const ui=`        <section class="construction-section">
          <p class="section-title">Construction project · v1</p>
          <label class="field-block"><span class="field-label">Version name</span><input id="project-name" value="House renovation" /></label>
          <div class="build-tools"><button id="save-version">Save version</button><button id="download-project">Download JSON</button><label class="upload-project">Upload JSON<input id="upload-project" type="file" accept="application/json,.json" hidden /></label></div>
          <p class="local-note" id="project-status">Autosave stays local. Download a version to share or archive it.</p>
          <p class="section-title">Live quantities</p>
          <p class="local-note" id="quantity-summary">0 proposed walls · 0.00 m · 0.00 m²</p>
          <p class="local-note">Wall endpoints snap into shared joints within 18 cm. Measurements use model metres.</p>
        </section>

${marker}`;
if(!html.includes(marker))throw new Error('HTML marker missing');
html=html.replace(marker,ui);

fs.writeFileSync(mainPath,js);
fs.writeFileSync(htmlPath,html);
