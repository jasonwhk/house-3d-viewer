from pathlib import Path

p=Path('src/main.js')
s=p.read_text()
if 'BUILD_MODE_V1' in s:
    raise SystemExit(0)

s=s.replace("const STORAGE_KEY = 'house3d-renovation-v1';", "const STORAGE_KEY = 'house3d-renovation-v1';\nconst BUILD_STORAGE_KEY = 'house3d-build-v1'; // BUILD_MODE_V1")
s=s.replace("const doorStates = new Map();", "const doorStates = new Map();\nconst buildRoot = new THREE.Group();\nbuildRoot.name = 'Local_Renovation_Build';\nscene.add(buildRoot);\nlet buildMode = 'none';\nlet buildStart = null;\nlet buildPreview = null;\nlet buildItems = loadBuildItems();\nlet outsideGround = null;")

anchor="function loadRenovationData() {"
insert=r'''function loadBuildItems() {
  try { const v = JSON.parse(localStorage.getItem(BUILD_STORAGE_KEY) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function saveBuildItems() { localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(buildItems)); }
function floorLevel(f='1') { return floorLevels.get(String(f)) ?? 0; }
function makeBuildMaterial(opacity=0.82) { return new THREE.MeshStandardMaterial({color:0x4f9a8d,roughness:.72,metalness:0,transparent:opacity<1,opacity}); }
function registerBuildMesh(mesh, walkable=false, collidable=true) {
  mesh.castShadow=true; mesh.receiveShadow=true; mesh.userData.localBuild=true;
  captureOriginalMaterial(mesh); buildRoot.add(mesh);
  groundMeshes.push(mesh); if (walkable) walkableMeshes.push(mesh); if (collidable) collisionMeshes.push(mesh);
}
function createWallItem(item, persist=false) {
  const a=new THREE.Vector3(...item.a), b=new THREE.Vector3(...item.b); const d=b.clone().sub(a); d.y=0;
  const len=Math.max(.15,d.length()), h=item.height||2.5, t=item.thickness||.12;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(len,h,t),makeBuildMaterial());
  mesh.name=item.id||`Proposed_Wall_${Date.now()}`; mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.position.y=(item.baseY??a.y)+h/2;
  mesh.rotation.y=-Math.atan2(d.z,d.x); registerBuildMesh(mesh,false,true);
  if(persist){buildItems.push({...item,id:mesh.name,type:'wall'});saveBuildItems();} return mesh;
}
function createStairItem(item,persist=false) {
  const a=new THREE.Vector3(...item.a), b=new THREE.Vector3(...item.b); const rise=(item.topY??b.y)-(item.baseY??a.y);
  const horizontal=new THREE.Vector3(b.x-a.x,0,b.z-a.z); const run=Math.max(1,horizontal.length()); const steps=Math.max(3,Math.ceil(Math.abs(rise)/.18));
  const dir=horizontal.normalize(); const width=item.width||.9; const depth=run/steps; const group=new THREE.Group(); group.name=item.id||`Proposed_Stairs_${Date.now()}`; buildRoot.add(group);
  for(let i=0;i<steps;i++){const y=(item.baseY??a.y)+(rise/steps)*(i+.5); const pos=new THREE.Vector3(a.x,y,a.z).addScaledVector(dir,depth*(i+.5)); const step=new THREE.Mesh(new THREE.BoxGeometry(depth,Math.abs(rise)/steps+.04,width),makeBuildMaterial()); step.position.copy(pos); step.rotation.y=-Math.atan2(dir.z,dir.x); step.name=`${group.name}_step_${i+1}`; step.userData.localBuild=true; step.castShadow=true;step.receiveShadow=true;captureOriginalMaterial(step);group.add(step);groundMeshes.push(step);walkableMeshes.push(step);collisionMeshes.push(step);}
  if(persist){buildItems.push({...item,id:group.name,type:'stairs'});saveBuildItems();} return group;
}
function restoreBuildItems(){for(const item of buildItems){if(item.type==='wall')createWallItem(item);if(item.type==='stairs')createStairItem(item);} }
function createOutsideGround(){
  if(outsideGround)return; const box=new THREE.Box3().setFromObject(house); const c=box.getCenter(new THREE.Vector3());
  const g=new THREE.Mesh(new THREE.PlaneGeometry(55,55),new THREE.MeshStandardMaterial({color:0x77836c,roughness:1,transparent:true,opacity:.72}));
  g.name='Outdoor_Walkable_Ground'; g.rotation.x=-Math.PI/2; g.position.set(c.x,box.min.y-.035,c.z); g.receiveShadow=true; g.userData.outdoorGround=true; scene.add(g); outsideGround=g; groundMeshes.push(g); walkableMeshes.push(g);
}
function buildPointFromPointer(event){
  const rect=renderer.domElement.getBoundingClientRect(); pointer.x=((event.clientX-rect.left)/rect.width)*2-1; pointer.y=-((event.clientY-rect.top)/rect.height)*2+1; raycaster.setFromCamera(pointer,camera);
  const targets=[...groundMeshes].filter(x=>x.visible); const hits=raycaster.intersectObjects(targets,false); return hits[0]?.point?.clone()||null;
}
function setBuildMode(mode){buildMode=mode;buildStart=null;if(buildPreview){buildPreview.removeFromParent();buildPreview=null;} document.body.dataset.buildMode=mode; const el=document.querySelector('#build-status');if(el)el.textContent=mode==='wall'?'ADD WALL: click start + end':mode==='stairs'?'ADD STAIRS: click bottom + top':'Build tools ready';}
function handleBuildClick(event){
  if(navigationMode!=='orbit'||buildMode==='none')return false; const point=buildPointFromPointer(event); if(!point)return true;
  if(!buildStart){buildStart=point; const el=document.querySelector('#build-status');if(el)el.textContent='Now click the end point';return true;}
  if(buildMode==='wall'){createWallItem({a:buildStart.toArray(),b:point.toArray(),baseY:Math.min(buildStart.y,point.y),height:2.5,thickness:.12},true);}
  if(buildMode==='stairs'){let base=buildStart.clone(),top=point.clone(); if(Math.abs(top.y-base.y)<.5){const current=currentMapFloor();const levels=[...floorLevels.entries()].sort((a,b)=>a[1]-b[1]);const idx=levels.findIndex(x=>x[0]===current);const next=levels[Math.min(idx+1,levels.length-1)];if(next)top.y=next[1];} createStairItem({a:base.toArray(),b:top.toArray(),baseY:base.y,topY:top.y,width:.9},true);}
  buildStart=null; const el=document.querySelector('#build-status');if(el)el.textContent='Placed. Click another start point or Esc to finish'; return true;
}
function deleteSelectedBuild(){if(!selectedObject)return false;let n=selectedObject;while(n&&n!==buildRoot&&!n.userData.localBuild)n=n.parent;if(!n||n===buildRoot)return false;const root=n.parent===buildRoot?n:n.parent;const id=root.name;root.removeFromParent();buildItems=buildItems.filter(x=>x.id!==id);saveBuildItems();clearSelection();return true;}
'''
s=s.replace(anchor,insert+'\n'+anchor)

s=s.replace("scene.add(house);\n        computeFloorLevels();", "scene.add(house);\n        computeFloorLevels();\n        createOutsideGround();\n        restoreBuildItems();")

old="""renderer.domElement.addEventListener('pointerup', (event) => {\n  if (navigationMode !== 'orbit' || event.button !== 0 || !pointerDown || !house) return;\n  const movement = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);\n  pointerDown = null;\n  if (movement > 5) return;"""
new="""renderer.domElement.addEventListener('pointerup', (event) => {\n  if (navigationMode !== 'orbit' || event.button !== 0 || !pointerDown || !house) return;\n  const movement = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);\n  pointerDown = null;\n  if (movement > 5) return;\n  if (handleBuildClick(event)) return;"""
s=s.replace(old,new)

s=s.replace("window.addEventListener('keydown', (event) => {", "document.querySelector('#add-wall')?.addEventListener('click',()=>setBuildMode('wall'));\ndocument.querySelector('#add-stairs')?.addEventListener('click',()=>setBuildMode('stairs'));\ndocument.querySelector('#build-cancel')?.addEventListener('click',()=>setBuildMode('none'));\ndocument.querySelector('#delete-build')?.addEventListener('click',deleteSelectedBuild);\n\nwindow.addEventListener('keydown', (event) => {")
s=s.replace("  if (event.code === 'KeyG') {", "  if (event.code === 'Escape' && buildMode !== 'none') { setBuildMode('none'); event.preventDefault(); return; }\n  if (event.code === 'KeyB' && navigationMode === 'orbit') { setBuildMode(buildMode==='wall'?'none':'wall'); event.preventDefault(); return; }\n  if (event.code === 'KeyN' && navigationMode === 'orbit') { setBuildMode(buildMode==='stairs'?'none':'stairs'); event.preventDefault(); return; }\n  if ((event.code === 'Delete' || event.code === 'Backspace') && deleteSelectedBuild()) { event.preventDefault(); return; }\n\n  if (event.code === 'KeyG') {")

p.write_text(s)

p=Path('index.html');h=p.read_text()
needle='''        <section>\n          <p class="section-title">View</p>'''
block='''        <section class="build-section">\n          <p class="section-title">Build / edit</p>\n          <div class="build-tools">\n            <button id="add-wall">B · Add wall</button>\n            <button id="add-stairs">N · Add stairs</button>\n            <button id="delete-build">Delete selected</button>\n            <button id="build-cancel">Cancel tool</button>\n          </div>\n          <p class="local-note" id="build-status">Build tools ready · click two points in Orbit mode.</p>\n          <p class="local-note">New geometry is stored only in this browser. Outdoor ground is walkable in POV.</p>\n        </section>\n\n'''
h=h.replace(needle,block+needle)
h=h.replace('WASD move · Tab panel/mouse', 'WASD move/outside · Tab panel/mouse')
h=h.replace('Drag to orbit · Scroll to zoom · Right-drag to pan · Click to inspect · G cycles renovation view','Drag to orbit · B wall · N stairs · Delete removes local build · G cycles renovation view')
p.write_text(h)

p=Path('src/style.css');css=p.read_text();css+='''\n/* BUILD_MODE_V1 */\n.build-tools{display:grid;grid-template-columns:1fr 1fr;gap:7px}.build-tools button{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);color:inherit;border-radius:8px;padding:9px 8px;cursor:pointer}.build-tools button:hover{background:rgba(79,154,141,.18);border-color:rgba(79,154,141,.55)}body[data-build-mode="wall"] #add-wall,body[data-build-mode="stairs"] #add-stairs{background:rgba(79,154,141,.28);border-color:#4f9a8d}\n''';p.write_text(css)
