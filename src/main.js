import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { initProject, getProject, setRenovation, getRenovation, removeRenovation, countRenovationStatuses } from './project/ProjectStore.js';
import { subscribe as subscribeProject } from './project/ProjectStore.js';
import { downloadProject, createUploadInput, triggerUpload } from './project/serialization.js';
import './style.css';

const STORAGE_KEY = 'house3d-renovation-v1';
const BUILD_STORAGE_KEY = 'house3d-build-v1'; // BUILD_MODE_V1

const mount = document.querySelector('#canvas-wrap');
const status = document.querySelector('#status');
const selectionEmpty = document.querySelector('#selection-empty');
const selectionDetails = document.querySelector('#selection-details');
const selectedName = document.querySelector('#selected-name');
const selectedType = document.querySelector('#selected-type');
const selectedFloor = document.querySelector('#selected-floor');
const selectedStatus = document.querySelector('#selected-status');
const clearSelectionButton = document.querySelector('#clear-selection');
const statusEditor = document.querySelector('#status-editor');
const disciplineSelect = document.querySelector('#discipline-select');
const renovationNote = document.querySelector('#renovation-note');
const renovationViewControls = document.querySelector('#renovation-view-controls');
const demolitionCount = document.querySelector('#demolition-count');
const proposedCount = document.querySelector('#proposed-count');
const modeControls = document.querySelector('#mode-controls');
const walkNote = document.querySelector('#walk-note');
const povHud = document.querySelector('#pov-hud');
const crosshair = document.querySelector('#crosshair');
const lookLabel = document.querySelector('#look-label');
const pointerLockCard = document.querySelector('#pointer-lock-card');
const resumeWalkButton = document.querySelector('#resume-walk');
const hint = document.querySelector('#hint');
const minimap = document.querySelector('#minimap');
const minimapViewport = document.querySelector('#minimap-viewport');
const minimapFloor = document.querySelector('#minimap-floor');
const minimapModeLabel = document.querySelector('#minimap-mode-label');
const playerMarker = document.querySelector('#player-marker');
const mapScaleBar = document.querySelector('.map-scale span');
const mapScaleLabel = document.querySelector('#map-scale-label');
const mapZoomIn = document.querySelector('#map-zoom-in');
const mapZoomOut = document.querySelector('#map-zoom-out');
const downloadProjectButton = document.querySelector('#download-project');
const uploadProjectButton = document.querySelector('#upload-project');
const projectStatus = document.querySelector('#project-status');

let renovationView = 'demolition';

// Initialize project store (migrates legacy localStorage on first pass)
const legacyRenovationData = loadRenovationData();
let legacyBuildItems = loadBuildItems();
initProject({ oldRenovationData: legacyRenovationData, oldBuildItems: legacyBuildItems });

// Keep legacy variables in sync for backwards compatibility
export const _project = getProject();
let renovationData = _project.renovation || {};
let buildItems = legacyBuildItems;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xebece8);

const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 500);
camera.position.set(12, 9, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
mount.appendChild(renderer.domElement);

const minimapRenderer = new THREE.WebGLRenderer({ antialias: true });
minimapRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
minimapRenderer.outputColorSpace = THREE.SRGBColorSpace;
minimapRenderer.toneMapping = THREE.ACESFilmicToneMapping;
minimapRenderer.toneMappingExposure = 1.0;
minimapRenderer.shadowMap.enabled = false;
minimapRenderer.setClearColor(0x1b221e, 1);
minimapViewport.prepend(minimapRenderer.domElement);

const minimapCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 80);
minimapCamera.up.set(0, 0, -1);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.06;
orbitControls.screenSpacePanning = true;
orbitControls.minDistance = 1;
orbitControls.maxDistance = 60;

const walkControls = new PointerLockControls(camera, renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x7b8079, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(8, 15, 10);
sun.castShadow = true;
scene.add(sun);

const grid = new THREE.GridHelper(40, 40, 0xaeb3ad, 0xd2d5d0);
grid.material.opacity = 0.45;
grid.material.transparent = true;
scene.add(grid);

const raycaster = new THREE.Raycaster();
const groundRaycaster = new THREE.Raycaster();
const collisionRaycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();

let pointerDown = null;
let house = null;
let initialView = null;
let selectionHelper = null;
let selectedObject = null;
let navigationMode = 'orbit';
let walkableMeshes = [];
let groundMeshes = [];
let collisionMeshes = [];
let currentLookObject = null;
let mapZoom = 5.5;
let mapExpanded = false;
let floorLevels = new Map();
let panelInteractionMode = false;
const doorStates = new Map();
const buildRoot = new THREE.Group();
buildRoot.name = 'Local_Renovation_Build';
scene.add(buildRoot);
let buildMode = 'none';
let buildStart = null;
let buildPreview = null;
let outsideGround = null;

const keys = new Set();
const player = {
  eyeHeight: 1.64,
  radius: 0.24,
  walkSpeed: 1.65,
  sprintSpeed: 3.4,
  maxStepUp: 0.34,
  maxDrop: 0.6,
};

function loadBuildItems() {
  try { const v = JSON.parse(localStorage.getItem(BUILD_STORAGE_KEY) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function syncBuildItems() {
  const current = _project.stairs || [];
  const walls = _project.walls || [];
  const counts = new Set([...current.map(s => s.id), ...walls.map(w => w.id)]);
  for (const item of buildItems) {
    if (!counts.has(item.id)) {
      // Add new items to project structure
      if (item.type === 'wall') {
        if (!_project.walls) _project.walls = [];
        _project.walls.push({ id: item.id, baseY: item.baseY ?? 0, height: item.height || 2.5, thickness: item.thickness || 0.12, placement: item });
      } else if (item.type === 'stairs') {
        if (!_project.stairs) _project.stairs = [];
        _project.stairs.push({ id: item.id, baseY: item.baseY ?? 0, topY: item.topY ?? 0, width: item.width || 0.9, placement: item });
      }
    }
  }
  // Persist immediately
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_project)); } catch {}
}
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

function loadRenovationData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveBuildItems() {
  try { syncBuildItems(); localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(buildItems)); }
  catch (error) { console.warn('Could not save build items', error); }
}

function frameObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z);
  const distance = radius / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.35;
  const direction = new THREE.Vector3(1, 0.7, 1).normalize();
  camera.position.copy(center).add(direction.multiplyScalar(distance));
  orbitControls.target.copy(center);
  camera.near = Math.max(radius / 1000, 0.01);
  camera.far = radius * 100;
  camera.fov = 38;
  camera.updateProjectionMatrix();
  orbitControls.update();
  initialView = { position: camera.position.clone(), target: orbitControls.target.clone() };
}

function floorFor(object) {
  let node = object;
  while (node) {
    const name = node.name || '';
    const rootMatch = name.match(/^Floor_([0-9]+)$/i);
    if (rootMatch) return rootMatch[1];
    const childMatch = name.match(/(?:^|_)F([0-9]+)(?:_|$)/i);
    if (childMatch) return childMatch[1];
    node = node.parent;
  }
  return null;
}

function isCeiling(object) {
  let node = object;
  while (node) {
    if (/ceiling/i.test(node.name || '')) return true;
    node = node.parent;
  }
  return false;
}

function isWalkable(object) {
  let node = object;
  while (node && node !== house) {
    const name = node.name || '';
    if (/^(floors?|stairs?|staircase)(?:_|$)/i.test(name)) return true;
    node = node.parent;
  }
  return false;
}

function semanticNodeFor(object) {
  let node = object;
  let fallback = object;
  const semanticPattern = /^(wall|door|window|opening|ceiling|floor|fixture|object|stair|sink|toilet|bathtub|cabinet)/i;
  while (node && node !== house) {
    if (node.name) {
      fallback = node;
      if (semanticPattern.test(node.name)) return node;
    }
    node = node.parent;
  }
  return fallback;
}

function typeFor(object) {
  const name = object?.name || '';
  const match = name.match(/^(wall|door|window|opening|ceiling|floor|fixture|object|stair|sink|toilet|bathtub|cabinet)/i);
  if (match) return match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  return object?.isMesh ? 'Mesh' : 'Object';
}

function objectKey(object) {
  const parts = [];
  let node = object;
  while (node && node !== house) {
    if (node.name) parts.unshift(node.name);
    node = node.parent;
  }
  return parts.join('/') || object?.uuid || 'unknown';
}

function renovationRecordFor(object) {
  const key = objectKey(object);
  return renovationData[key] || { status: 'existing', discipline: 'architecture', note: '' };
}

function effectiveRenovationStatus(mesh) {
  let node = mesh;
  while (node && node !== house) {
    const record = renovationData[objectKey(node)];
    if (record?.status && record.status !== 'existing') return record.status;
    node = node.parent;
  }
  return 'existing';
}

function captureOriginalMaterial(mesh) {
  if (mesh.userData.renovationOriginalMaterial) return;
  mesh.userData.renovationOriginalMaterial = mesh.material;
  mesh.userData.renovationMaterialCache = {};
}

function cloneTintedMaterial(material, tint, mix, opacity = 1) {
  const clone = material.clone();
  if (clone.color) clone.color.lerp(new THREE.Color(tint), mix);
  if (clone.emissive) clone.emissive.lerp(new THREE.Color(tint), Math.min(mix * 0.3, 0.22));
  if (opacity < 1) {
    clone.transparent = true;
    clone.opacity = opacity;
    clone.depthWrite = opacity > 0.55;
  }
  return clone;
}

function materialVariant(mesh, kind) {
  captureOriginalMaterial(mesh);
  const cache = mesh.userData.renovationMaterialCache;
  if (cache[kind]) return cache[kind];
  const original = mesh.userData.renovationOriginalMaterial;
  const source = Array.isArray(original) ? original : [original];
  const variants = source.map((material) => {
    if (kind === 'demolish') return cloneTintedMaterial(material, 0xc95d49, 0.68, 0.62);
    if (kind === 'proposed') return cloneTintedMaterial(material, 0x4f9a8d, 0.58, 0.9);
    if (kind === 'dim') return cloneTintedMaterial(material, 0x7f8983, 0.35, 0.26);
    return material;
  });
  cache[kind] = Array.isArray(original) ? variants : variants[0];
  return cache[kind];
}

function applyRenovationMaterial(mesh, statusValue) {
  captureOriginalMaterial(mesh);
  const original = mesh.userData.renovationOriginalMaterial;
  if (renovationView === 'demolition') {
    mesh.material = statusValue === 'demolish' ? materialVariant(mesh, 'demolish') : materialVariant(mesh, 'dim');
    return;
  }
  if (renovationView === 'proposed') {
    mesh.material = statusValue === 'proposed' ? materialVariant(mesh, 'proposed') : original;
    return;
  }
  if (renovationView === 'combined') {
    if (statusValue === 'demolish') mesh.material = materialVariant(mesh, 'demolish');
    else if (statusValue === 'proposed') mesh.material = materialVariant(mesh, 'proposed');
    else mesh.material = original;
    return;
  }
  mesh.material = original;
}

function renovationVisible(statusValue) {
  if (renovationView === 'asbuilt') return statusValue !== 'proposed';
  if (renovationView === 'demolition') return statusValue !== 'proposed';
  if (renovationView === 'proposed') return statusValue !== 'demolish';
  return true;
}

function setRenovationView(view, announce = false) {
  const allowed = ['asbuilt', 'demolition', 'proposed', 'combined'];
  if (!allowed.includes(view)) return;
  renovationView = view;
  renovationViewControls.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('active', button.dataset.renovationView === renovationView);
  });
  applyVisibility();
  if (announce && navigationMode === 'walk') {
    const labels = { asbuilt: 'As-built', demolition: 'Demolition', proposed: 'Proposed', combined: 'Combined' };
    lookLabel.textContent = `${labels[renovationView]} renovation view`;
  }
}

function cycleRenovationView() {
  const order = ['demolition', 'proposed', 'combined', 'asbuilt'];
  const next = order[(order.indexOf(renovationView) + 1) % order.length];
  setRenovationView(next, true);
}

function updateRenovationCounts() {
  const counts = countRenovationStatuses();
  demolitionCount.textContent = String(counts.demolish);
  proposedCount.textContent = String(counts.proposed);
}

function updateSelectionEditor() {
  if (!selectedObject) return;
  const record = renovationRecordFor(selectedObject);
  selectedStatus.textContent = record.status === 'demolish' ? 'Demolish' : record.status === 'proposed' ? 'Proposed' : 'Existing';
  statusEditor.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('active', button.dataset.renovationStatus === record.status);
  });
  disciplineSelect.value = record.discipline || 'architecture';
  renovationNote.value = record.note || '';
}

function setSelectedRenovationField(field, value) {
  if (!selectedObject) return;
  const key = objectKey(selectedObject);
  const current = renovationData[key] || getRenovation(key);
  renovationData[key] = { ...current, [field]: value };
  setRenovation(key, renovationData[key]);
  saveBuildItems();
  updateSelectionEditor();
  updateRenovationCounts();
  applyVisibility();
  if (field === 'status' && navigationMode === 'walk') {
    const labels = { existing: 'Existing', demolish: 'Demolish', proposed: 'Proposed' };
    lookLabel.textContent = `${selectedObject.name || 'Object'} → ${labels[value]}`;
  }
}

function doorNodeFor(object) {
  let node = object;
  while (node && node !== house) {
    if (/^Door(?:_|$)/i.test(node.name || '')) return node;
    node = node.parent;
  }
  return null;
}

function prepareDoor(door) {
  if (!door) return null;
  if (doorStates.has(door)) return doorStates.get(door);
  if (!door.parent) return null;
  house.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(door);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const widthAlongX = size.x >= size.z;
  const hingeWorld = center.clone();
  if (widthAlongX) hingeWorld.x = box.min.x;
  else hingeWorld.z = box.min.z;
  const parent = door.parent;
  const pivot = new THREE.Group();
  pivot.name = `${door.name || 'Door'}__hinge`;
  parent.add(pivot);
  pivot.position.copy(parent.worldToLocal(hingeWorld.clone()));
  pivot.attach(door);
  house.updateMatrixWorld(true);
  let openSign;
  if (widthAlongX) openSign = camera.position.z >= center.z ? 1 : -1;
  else openSign = camera.position.x >= center.x ? -1 : 1;
  const state = { door, pivot, center, widthAlongX, targetOpen: false, angle: 0, openAngle: openSign * Math.PI * 0.5 };
  doorStates.set(door, state);
  return state;
}

function toggleDoor(object) {
  const door = doorNodeFor(object);
  if (!door) return false;
  const state = prepareDoor(door);
  if (!state) return false;
  if (!state.targetOpen) {
    const box = new THREE.Box3().setFromObject(door);
    const center = box.getCenter(new THREE.Vector3());
    if (state.widthAlongX) state.openAngle = (camera.position.z >= center.z ? 1 : -1) * Math.PI * 0.5;
    else state.openAngle = (camera.position.x >= center.x ? -1 : 1) * Math.PI * 0.5;
    state.targetOpen = true;
    return true;
  }
  const doorCenter = new THREE.Box3().setFromObject(door).getCenter(new THREE.Vector3());
  const horizontalDistance = Math.hypot(camera.position.x - doorCenter.x, camera.position.z - doorCenter.z);
  if (horizontalDistance < 1.0) {
    lookLabel.textContent = 'Move away from the doorway before closing';
    return true;
  }
  state.targetOpen = false;
  return true;
}

function updateDoorAnimations(deltaTime) {
  for (const state of doorStates.values()) {
    const target = state.targetOpen ? state.openAngle : 0;
    state.angle = THREE.MathUtils.damp(state.angle, target, 10, Math.min(deltaTime, 0.05));
    state.pivot.rotation.y = state.angle;
  }
}

function clearSelection() {
  selectedObject = null;
  if (selectionHelper) {
    scene.remove(selectionHelper);
    selectionHelper.geometry?.dispose();
    selectionHelper.material?.dispose();
    selectionHelper = null;
  }
  selectionEmpty.hidden = false;
  selectionDetails.hidden = true;
  clearSelectionButton.hidden = true;
}

function selectObject(object) {
  clearSelection();
  selectedObject = semanticNodeFor(object);
  selectionHelper = new THREE.BoxHelper(selectedObject, 0xd3772e);
  selectionHelper.material.depthTest = false;
  selectionHelper.material.transparent = true;
  selectionHelper.material.opacity = 0.9;
  selectionHelper.renderOrder = 999;
  scene.add(selectionHelper);
  selectedName.textContent = selectedObject.name || object.name || 'Unnamed object';
  selectedType.textContent = typeFor(selectedObject);
  const selectedFloorValue = floorFor(selectedObject);
  selectedFloor.textContent = selectedFloorValue ? `Floor ${selectedFloorValue}` : '—';
  selectionEmpty.hidden = true;
  selectionDetails.hidden = false;
  clearSelectionButton.hidden = false;
  updateSelectionEditor();
}

function selectedObjectHasVisibleMesh() {
  if (!selectedObject) return false;
  let visible = false;
  selectedObject.traverse((node) => {
    if (node.isMesh && node.visible) visible = true;
  });
  return visible;
}

function applyVisibility() {
  if (!house) return;
  const selectedFloorView = document.querySelector('#floor-controls .active')?.dataset.floor || 'all';
  const showCeilings = document.querySelector('#ceilings').checked;
  house.traverse((node) => {
    if (!node.isMesh) return;
    const floor = floorFor(node);
    const floorVisible = selectedFloorView === 'all' || !floor || floor === selectedFloorView;
    const statusValue = effectiveRenovationStatus(node);
    node.visible = floorVisible && (showCeilings || !isCeiling(node)) && renovationVisible(statusValue);
    applyRenovationMaterial(node, statusValue);
  });
  if (selectedObject && !selectedObjectHasVisibleMesh()) clearSelection();
}

function visibleMeshes(meshes) {
  return meshes.filter((mesh) => mesh.visible);
}

function surfaceNormalWorld(hit) {
  if (!hit.face) return null;
  return hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
}

function findGroundAt(position, referenceGround = position.y - player.eyeHeight) {
  if (!groundMeshes.length) return null;
  const probeUp = player.maxStepUp + 0.45;
  const origin = new THREE.Vector3(position.x, referenceGround + probeUp, position.z);
  groundRaycaster.set(origin, new THREE.Vector3(0, -1, 0));
  groundRaycaster.near = 0;
  groundRaycaster.far = probeUp + player.maxDrop + 0.9;
  const hits = groundRaycaster.intersectObjects(visibleMeshes(groundMeshes), false);
  for (const hit of hits) {
    const normal = surfaceNormalWorld(hit);
    if (!normal || normal.y < 0.45) continue;
    const elevationChange = hit.point.y - referenceGround;
    if (elevationChange <= player.maxStepUp + 0.03 && elevationChange >= -player.maxDrop - 0.03) return hit.point.y;
  }
  return null;
}

function findWalkSpawn(floor = '1') {
  if (!house) return null;
  const box = new THREE.Box3();
  let found = false;
  house.traverse((node) => {
    if (!node.isMesh || floorFor(node) !== floor) return;
    const nodeBox = new THREE.Box3().setFromObject(node);
    if (!nodeBox.isEmpty()) {
      box.union(nodeBox);
      found = true;
    }
  });
  if (!found || box.isEmpty()) return null;
  const center = box.getCenter(new THREE.Vector3());
  const start = new THREE.Vector3(center.x, box.max.y + 1, center.z);
  groundRaycaster.set(start, new THREE.Vector3(0, -1, 0));
  groundRaycaster.near = 0;
  groundRaycaster.far = box.getSize(new THREE.Vector3()).y + 3;
  const preferred = visibleMeshes(walkableMeshes.filter((mesh) => floorFor(mesh) === floor));
  const candidates = preferred.length ? preferred : visibleMeshes(groundMeshes.filter((mesh) => floorFor(mesh) === floor));
  const hits = groundRaycaster.intersectObjects(candidates, false);
  for (const hit of hits) {
    const normal = surfaceNormalWorld(hit);
    if (normal && normal.y > 0.45) return new THREE.Vector3(center.x, hit.point.y + player.eyeHeight, center.z);
  }
  return null;
}

function blockedByGeometry(from, delta) {
  const distance = delta.length();
  if (distance < 1e-5) return false;
  const direction = delta.clone().normalize();
  const right = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(player.radius * 0.72);
  const forwardProbe = distance + player.radius;
  const heights = [-player.eyeHeight * 0.52, -0.18];
  const offsets = [new THREE.Vector3(), right, right.clone().multiplyScalar(-1)];
  const meshes = visibleMeshes(collisionMeshes);
  for (const yOffset of heights) {
    for (const sideOffset of offsets) {
      const origin = from.clone().add(sideOffset);
      origin.y += yOffset;
      collisionRaycaster.set(origin, direction);
      collisionRaycaster.near = 0;
      collisionRaycaster.far = forwardProbe;
      const hits = collisionRaycaster.intersectObjects(meshes, false);
      const blockingHit = hits.find((hit) => {
        if (doorNodeFor(hit.object)) return false;
        const normal = surfaceNormalWorld(hit);
        if (!normal) return true;
        return Math.abs(normal.y) < 0.78;
      });
      if (blockingHit) return true;
    }
  }
  return false;
}

function updateWalkMovement(deltaTime) {
  if (navigationMode !== 'walk' || !walkControls.isLocked || !house) return;
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  if (!forward && !strafe) return;
  const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? player.sprintSpeed : player.walkSpeed;
  const look = new THREE.Vector3();
  camera.getWorldDirection(look);
  look.y = 0;
  if (look.lengthSq() < 1e-6) return;
  look.normalize();
  const right = new THREE.Vector3().crossVectors(look, camera.up).normalize();
  const move = look.multiplyScalar(forward).add(right.multiplyScalar(strafe));
  if (move.lengthSq() > 1) move.normalize();
  move.multiplyScalar(speed * Math.min(deltaTime, 0.05));
  const current = camera.position.clone();
  const currentGround = current.y - player.eyeHeight;
  const proposed = current.clone().add(move);
  const ground = findGroundAt(proposed, currentGround);
  if (ground === null) return;
  const elevationChange = ground - currentGround;
  if (elevationChange > player.maxStepUp || elevationChange < -player.maxDrop) return;
  if (blockedByGeometry(current, move)) return;
  proposed.y = ground + player.eyeHeight;
  camera.position.copy(proposed);
}

function updatePOVTarget() {
  if (navigationMode !== 'walk' || !house) return;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = 4.5;
  const hits = raycaster.intersectObject(house, true).filter((hit) => hit.object.visible);
  currentLookObject = hits.length ? hits[0].object : null;
  if (currentLookObject) {
    const semantic = semanticNodeFor(currentLookObject);
    const door = doorNodeFor(currentLookObject);
    crosshair.classList.add('target');
    if (door) {
      const state = doorStates.get(door);
      const action = state?.targetOpen ? 'close' : 'open';
      lookLabel.textContent = `${door.name || 'Door'} · F ${action} · E select`;
    } else {
      lookLabel.textContent = `${semantic.name || typeFor(semantic)} · E select · Z/X/C classify`;
    }
  } else {
    crosshair.classList.remove('target');
    lookLabel.textContent = 'Aim at an element · E to select';
  }
}

function computeFloorLevels() {
  floorLevels = new Map();
  for (const floor of ['0', '1', '2', '3', '4']) {
    const meshes = walkableMeshes.filter((mesh) => floorFor(mesh) === floor);
    if (!meshes.length) continue;
    const box = new THREE.Box3();
    for (const mesh of meshes) box.union(new THREE.Box3().setFromObject(mesh));
    if (!box.isEmpty()) floorLevels.set(floor, box.min.y);
  }
}

function currentMapFloor() {
  if (!house) return '1';
  const origin = camera.position.clone();
  origin.y += 0.2;
  groundRaycaster.set(origin, new THREE.Vector3(0, -1, 0));
  groundRaycaster.near = 0;
  groundRaycaster.far = player.eyeHeight + 1.2;
  const hits = groundRaycaster.intersectObjects(groundMeshes, false);
  for (const hit of hits) {
    const normal = surfaceNormalWorld(hit);
    if (!normal || normal.y < 0.35) continue;
    const floor = floorFor(hit.object);
    if (floor) return floor;
  }
  let bestFloor = '1';
  let bestDistance = Infinity;
  const playerGround = camera.position.y - player.eyeHeight;
  for (const [floor, level] of floorLevels.entries()) {
    const distance = Math.abs(playerGround - level);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestFloor = floor;
    }
  }
  return bestFloor;
}

function resizeMinimapRenderer() {
  const rect = minimapViewport.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const size = minimapRenderer.getSize(new THREE.Vector2());
  if (size.x !== width || size.y !== height) minimapRenderer.setSize(width, height, false);
}

function updateMapScale() {
  const viewportWidth = Math.max(minimapViewport.clientWidth, 1);
  const meters = mapZoom >= 8 ? 4 : mapZoom >= 4 ? 2 : 1;
  const pixels = THREE.MathUtils.clamp((meters / (mapZoom * 2)) * viewportWidth, 24, viewportWidth * 0.45);
  mapScaleBar.style.width = `${pixels}px`;
  mapScaleLabel.textContent = `${meters} m`;
}

function renderMinimap() {
  if (navigationMode !== 'walk' || !house || minimap.hidden) return;
  resizeMinimapRenderer();
  const floor = currentMapFloor();
  minimapFloor.textContent = floor === '0' ? 'BASEMENT' : `FLOOR ${floor}`;
  minimapCamera.left = -mapZoom;
  minimapCamera.right = mapZoom;
  minimapCamera.top = mapZoom;
  minimapCamera.bottom = -mapZoom;
  minimapCamera.position.set(camera.position.x, camera.position.y + 28, camera.position.z);
  minimapCamera.lookAt(camera.position.x, camera.position.y, camera.position.z);
  minimapCamera.updateProjectionMatrix();
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.y = 0;
  if (direction.lengthSq() > 1e-5) {
    direction.normalize();
    const heading = THREE.MathUtils.radToDeg(Math.atan2(direction.x, -direction.z));
    playerMarker.querySelector('span').style.transform = `rotate(${heading}deg)`;
  }
  const savedBackground = scene.background;
  const savedGrid = grid.visible;
  const savedSelection = selectionHelper?.visible;
  const visibility = [];
  house.traverse((node) => {
    if (!node.isMesh) return;
    visibility.push([node, node.visible]);
    const nodeFloor = floorFor(node);
    node.visible = node.visible && !isCeiling(node) && (!nodeFloor || nodeFloor === floor);
  });
  grid.visible = false;
  if (selectionHelper) selectionHelper.visible = false;
  scene.background = new THREE.Color(0x1b221e);
  minimapRenderer.render(scene, minimapCamera);
  scene.background = savedBackground;
  grid.visible = savedGrid;
  if (selectionHelper) selectionHelper.visible = savedSelection;
  for (const [node, visible] of visibility) node.visible = visible;
  updateMapScale();
}

function setMapZoom(nextZoom) {
  mapZoom = THREE.MathUtils.clamp(nextZoom, 2.2, 14);
  updateMapScale();
}

function toggleTacticalMap(force = null) {
  mapExpanded = force === null ? !mapExpanded : force;
  minimap.classList.toggle('expanded', mapExpanded);
  document.body.classList.toggle('map-open', mapExpanded);
  minimapModeLabel.textContent = mapExpanded ? 'TACTICAL MAP' : 'LOCAL MAP';
  requestAnimationFrame(resizeMinimapRenderer);
}

function setWholeHouseVisibleForWalk() {
  document.querySelectorAll('#floor-controls button').forEach((button) => {
    button.classList.toggle('active', button.dataset.floor === 'all');
  });
  document.querySelector('#ceilings').checked = true;
  applyVisibility();
}

function teleportToFloor(floor) {
  const spawn = findWalkSpawn(floor);
  if (!spawn) {
    lookLabel.textContent = `No safe spawn found for Floor ${floor}`;
    return false;
  }
  keys.clear();
  camera.position.copy(spawn);
  minimapFloor.textContent = floor === '0' ? 'BASEMENT' : `FLOOR ${floor}`;
  lookLabel.textContent = `Teleported to Floor ${floor}`;
  return true;
}

function respawnWalk() {
  teleportToFloor('1');
}

function enterWalkMode() {
  if (!house || navigationMode === 'walk') return;
  navigationMode = 'walk';
  panelInteractionMode = false;
  clearSelection();
  setWholeHouseVisibleForWalk();
  orbitControls.enabled = false;
  grid.visible = false;
  document.body.classList.add('walk-mode');
  walkNote.hidden = false;
  povHud.hidden = false;
  minimap.hidden = false;
  pointerLockCard.hidden = false;
  hint.hidden = true;
  modeControls.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.mode === 'walk'));
  respawnWalk();
  camera.fov = 72;
  camera.near = 0.04;
  camera.updateProjectionMatrix();
  camera.rotation.set(0, 0, 0);
  requestAnimationFrame(resizeMinimapRenderer);
  walkControls.lock();
}

function exitWalkMode() {
  if (navigationMode !== 'walk') return;
  navigationMode = 'orbit';
  panelInteractionMode = false;
  if (walkControls.isLocked) walkControls.unlock();
  keys.clear();
  currentLookObject = null;
  toggleTacticalMap(false);
  minimap.hidden = true;
  orbitControls.enabled = true;
  grid.visible = true;
  document.body.classList.remove('walk-mode');
  walkNote.hidden = true;
  povHud.hidden = true;
  pointerLockCard.hidden = true;
  hint.hidden = false;
  modeControls.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.mode === 'orbit'));
  if (initialView) {
    camera.fov = 38;
    camera.position.copy(initialView.position);
    orbitControls.target.copy(initialView.target);
    camera.near = 0.01;
    camera.updateProjectionMatrix();
    orbitControls.update();
  }
}

async function loadHouse() {
  try {
    status.lastChild.textContent = ' Loading model';
    const modelUrl = `${import.meta.env.BASE_URL}models/house-existing.glb.dat`;
    const response = await fetch(modelUrl);
    if (!response.ok) throw new Error(`Model asset returned ${response.status}`);
    const glb = await response.arrayBuffer();
    new GLTFLoader().parse(
      glb,
      '',
      (gltf) => {
        house = gltf.scene;
        house.updateMatrixWorld(true);
        walkableMeshes = [];
        groundMeshes = [];
        collisionMeshes = [];
        doorStates.clear();
        house.traverse((node) => {
          if (!node.isMesh) return;
          node.castShadow = true;
          node.receiveShadow = true;
          captureOriginalMaterial(node);
          collisionMeshes.push(node);
          if (!isCeiling(node) && !doorNodeFor(node)) groundMeshes.push(node);
          if (isWalkable(node)) walkableMeshes.push(node);
        });
        scene.add(house);
        computeFloorLevels();
        createOutsideGround();
        restoreBuildItems();
        frameObject(house);
        updateRenovationCounts();
        setRenovationView('demolition');
        status.classList.add('ready');
        status.lastChild.textContent = ' Model loaded';
      },
      (error) => {
        console.error(error);
        status.classList.add('error');
        status.lastChild.textContent = ' Model unreadable';
      },
    );
  } catch (error) {
    console.error(error);
    status.classList.add('error');
    status.lastChild.textContent = ' Model missing';
  }
}

loadHouse();
updateRenovationCounts();

renovationViewControls.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-renovation-view]');
  if (!button) return;
  setRenovationView(button.dataset.renovationView);
});

statusEditor.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-renovation-status]');
  if (!button || !selectedObject) return;
  setSelectedRenovationField('status', button.dataset.renovationStatus);
});

disciplineSelect.addEventListener('change', () => {
  if (selectedObject) setSelectedRenovationField('discipline', disciplineSelect.value);
});

renovationNote.addEventListener('input', () => {
  if (!selectedObject) return;
  const key = objectKey(selectedObject);
  const current = renovationData[key] || getRenovation(key);
  renovationData[key] = { ...current, note: renovationNote.value };
  setRenovation(key, renovationData[key]);
});

modeControls.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-mode]');
  if (!button || !house) return;
  if (button.dataset.mode === 'walk') enterWalkMode();
  else exitWalkMode();
});

walkControls.addEventListener('lock', () => {
  if (navigationMode !== 'walk') return;
  panelInteractionMode = false;
  pointerLockCard.hidden = true;
});

walkControls.addEventListener('unlock', () => {
  keys.clear();
  if (navigationMode === 'walk') pointerLockCard.hidden = panelInteractionMode;
});

resumeWalkButton.addEventListener('click', () => {
  if (navigationMode === 'walk') {
    panelInteractionMode = false;
    walkControls.lock();
  }
});

mapZoomIn.addEventListener('click', () => setMapZoom(mapZoom * 0.8));
mapZoomOut.addEventListener('click', () => setMapZoom(mapZoom * 1.25));

document.querySelector('#floor-controls').addEventListener('click', (event) => {
  if (navigationMode === 'walk') return;
  const button = event.target.closest('button[data-floor]');
  if (!button) return;
  document.querySelectorAll('#floor-controls button').forEach((b) => b.classList.remove('active'));
  button.classList.add('active');
  applyVisibility();
});

document.querySelector('#ceilings').addEventListener('change', () => {
  if (navigationMode === 'walk') document.querySelector('#ceilings').checked = true;
  applyVisibility();
});

document.querySelector('#reset').addEventListener('click', () => {
  if (navigationMode === 'walk') {
    respawnWalk();
    return;
  }
  if (!initialView) return;
  camera.position.copy(initialView.position);
  orbitControls.target.copy(initialView.target);
  orbitControls.update();
});

clearSelectionButton.addEventListener('click', clearSelection);

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (navigationMode !== 'orbit' || event.button !== 0) return;
  pointerDown = { x: event.clientX, y: event.clientY };
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (navigationMode !== 'orbit' || event.button !== 0 || !pointerDown || !house) return;
  const movement = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  pointerDown = null;
  if (movement > 5) return;
  if (handleBuildClick(event)) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(house, true).filter((hit) => hit.object.visible);
  if (hits.length) selectObject(hits[0].object);
  else clearSelection();
});

document.querySelector('#add-wall')?.addEventListener('click',()=>setBuildMode('wall'));
document.querySelector('#add-stairs')?.addEventListener('click',()=>setBuildMode('stairs'));
document.querySelector('#build-cancel')?.addEventListener('click',()=>setBuildMode('none'));
document.querySelector('#delete-build')?.addEventListener('click',deleteSelectedBuild);

// Project download / upload
let projectUploadInput = null;
if (downloadProjectButton) {
  downloadProjectButton.addEventListener('click', () => {
    const projectName = getProject().project?.name || 'house';
    downloadProject(projectName, getProject());
    projectStatus.textContent = 'Project downloaded.';
    setTimeout(() => { projectStatus.textContent = 'Project data is saved automatically in this browser. Download to export or share.'; }, 3000);
  });
}
if (uploadProjectButton) {
  projectUploadInput = createUploadInput(
    (loadedProject) => {
      projectUploadInput = null; // clean up
      setProject(loadedProject);
      buildItems = [];
      const migrated = JSON.parse(JSON.stringify(_project.renovation || {}));
      renovationData = migrated;
      // Restore build items from project structure
      for (const wall of _project.walls || []) {
        if (wall.placement) buildItems.push(wall.placement);
      }
      for (const stair of _project.stairs || []) {
        if (stair.placement) buildItems.push(stair.placement);
      }
      applyVisibility();
      updateRenovationCounts();
      projectStatus.textContent = 'Project uploaded and loaded.';
      setTimeout(() => { projectStatus.textContent = 'Project data is saved automatically in this browser. Download to export or share.'; }, 3000);
    },
    ({ errors }) => {
      projectStatus.textContent = 'Upload failed: ' + errors.join('; ');
      setTimeout(() => { projectStatus.textContent = 'Project data is saved automatically in this browser. Download to export or share.'; }, 5000);
    }
  );
  uploadProjectButton.addEventListener('click', () => triggerUpload(projectUploadInput));
}

window.addEventListener('keydown', (event) => {
  const target = event.target;
  const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
  if (editing) return;

  if (event.code === 'Escape' && buildMode !== 'none') { setBuildMode('none'); event.preventDefault(); return; }
  if (event.code === 'KeyB' && navigationMode === 'orbit') { setBuildMode(buildMode==='wall'?'none':'wall'); event.preventDefault(); return; }
  if (event.code === 'KeyN' && navigationMode === 'orbit') { setBuildMode(buildMode==='stairs'?'none':'stairs'); event.preventDefault(); return; }
  if ((event.code === 'Delete' || event.code === 'Backspace') && deleteSelectedBuild()) { event.preventDefault(); return; }

  if (event.code === 'KeyG') {
    cycleRenovationView();
    event.preventDefault();
    return;
  }

  const statusShortcut = { KeyZ: 'existing', KeyX: 'demolish', KeyC: 'proposed' }[event.code];
  if (statusShortcut && selectedObject) {
    setSelectedRenovationField('status', statusShortcut);
    event.preventDefault();
    return;
  }

  if (navigationMode !== 'walk') return;

  if (event.code === 'Tab') {
    panelInteractionMode = walkControls.isLocked;
    if (walkControls.isLocked) {
      walkControls.unlock();
      pointerLockCard.hidden = true;
    } else {
      panelInteractionMode = false;
      walkControls.lock();
    }
    event.preventDefault();
    return;
  }

  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
    keys.add(event.code);
    event.preventDefault();
  }
  if (event.code === 'KeyE' && currentLookObject) {
    selectObject(currentLookObject);
    event.preventDefault();
  }
  if (event.code === 'KeyF' && currentLookObject) {
    if (toggleDoor(currentLookObject)) event.preventDefault();
  }
  const floorShortcut = { Digit1: '1', Numpad1: '1', Digit2: '2', Numpad2: '2', Digit3: '3', Numpad3: '3' }[event.code];
  if (floorShortcut) {
    teleportToFloor(floorShortcut);
    event.preventDefault();
  }
  if (event.code === 'KeyR') {
    respawnWalk();
    event.preventDefault();
  }
  if (event.code === 'KeyM') {
    toggleTacticalMap();
    event.preventDefault();
  }
  if (['Equal', 'NumpadAdd'].includes(event.code)) {
    setMapZoom(mapZoom * 0.8);
    event.preventDefault();
  }
  if (['Minus', 'NumpadSubtract'].includes(event.code)) {
    setMapZoom(mapZoom * 1.25);
    event.preventDefault();
  }
});

window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

function resize() {
  const width = mount.clientWidth;
  const height = mount.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (!minimap.hidden) resizeMinimapRenderer();
}

new ResizeObserver(resize).observe(mount);
renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  if (navigationMode === 'orbit') orbitControls.update();
  else {
    updateWalkMovement(delta);
    updatePOVTarget();
  }
  updateDoorAnimations(delta);
  if (selectionHelper) selectionHelper.update();
  renderer.render(scene, camera);
  if (navigationMode === 'walk') renderMinimap();
});
