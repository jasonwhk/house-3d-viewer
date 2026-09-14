import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import './style.css';

const mount = document.querySelector('#canvas-wrap');
const status = document.querySelector('#status');
const selectionEmpty = document.querySelector('#selection-empty');
const selectionInfo = document.querySelector('#selection-info');
const selectedName = document.querySelector('#selected-name');
const selectedType = document.querySelector('#selected-type');
const selectedFloor = document.querySelector('#selected-floor');
const clearSelectionButton = document.querySelector('#clear-selection');
const modeControls = document.querySelector('#mode-controls');
const walkNote = document.querySelector('#walk-note');
const povHud = document.querySelector('#pov-hud');
const crosshair = document.querySelector('#crosshair');
const lookLabel = document.querySelector('#look-label');
const pointerLockCard = document.querySelector('#pointer-lock-card');
const resumeWalkButton = document.querySelector('#resume-walk');
const hint = document.querySelector('#hint');

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

const keys = new Set();
const player = {
  eyeHeight: 1.64,
  radius: 0.24,
  walkSpeed: 1.65,
  sprintSpeed: 3.4,
  maxStepUp: 0.34,
  maxDrop: 0.6,
};

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
    const rootMatch = name.match(/^Floor_([123])$/i);
    if (rootMatch) return rootMatch[1];
    const childMatch = name.match(/(?:^|_)F([123])(?:_|$)/i);
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

function clearSelection() {
  selectedObject = null;
  if (selectionHelper) {
    scene.remove(selectionHelper);
    selectionHelper.geometry?.dispose();
    selectionHelper.material?.dispose();
    selectionHelper = null;
  }
  selectionEmpty.hidden = false;
  selectionInfo.hidden = true;
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
  selectedFloor.textContent = floorFor(selectedObject) ? `Floor ${floorFor(selectedObject)}` : '—';
  selectionEmpty.hidden = true;
  selectionInfo.hidden = false;
  clearSelectionButton.hidden = false;
}

function applyVisibility() {
  if (!house) return;
  const selected = document.querySelector('#floor-controls .active')?.dataset.floor || 'all';
  const showCeilings = document.querySelector('#ceilings').checked;
  house.traverse((node) => {
    if (!node.isMesh) return;
    const floor = floorFor(node);
    const floorVisible = selected === 'all' || !floor || floor === selected;
    node.visible = floorVisible && (showCeilings || !isCeiling(node));
  });

  if (selectedObject) {
    const selectedFloorValue = floorFor(selectedObject);
    const hiddenByFloor = selected !== 'all' && selectedFloorValue && selectedFloorValue !== selected;
    const hiddenCeiling = !showCeilings && isCeiling(selectedObject);
    if (hiddenByFloor || hiddenCeiling) clearSelection();
  }
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
    if (elevationChange <= player.maxStepUp + 0.03 && elevationChange >= -player.maxDrop - 0.03) {
      return hit.point.y;
    }
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

  // Probe walls at torso/head height. Stair risers remain below these probes,
  // so a valid tread can be stepped onto instead of being treated as a wall.
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
    crosshair.classList.add('target');
    lookLabel.textContent = `${semantic.name || typeFor(semantic)} · E to inspect`;
  } else {
    crosshair.classList.remove('target');
    lookLabel.textContent = 'Aim at an element · E to inspect';
  }
}

function setWholeHouseVisibleForWalk() {
  document.querySelectorAll('#floor-controls button').forEach((button) => {
    button.classList.toggle('active', button.dataset.floor === 'all');
  });
  document.querySelector('#ceilings').checked = true;
  applyVisibility();
}

function respawnWalk() {
  const spawn = findWalkSpawn('1');
  if (spawn) camera.position.copy(spawn);
}

function enterWalkMode() {
  if (!house || navigationMode === 'walk') return;
  navigationMode = 'walk';
  clearSelection();
  setWholeHouseVisibleForWalk();
  orbitControls.enabled = false;
  grid.visible = false;
  document.body.classList.add('walk-mode');
  walkNote.hidden = false;
  povHud.hidden = false;
  pointerLockCard.hidden = false;
  hint.hidden = true;
  modeControls.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.mode === 'walk'));

  respawnWalk();
  camera.fov = 72;
  camera.near = 0.04;
  camera.updateProjectionMatrix();
  camera.rotation.set(0, 0, 0);
  walkControls.lock();
}

function exitWalkMode() {
  if (navigationMode !== 'walk') return;
  navigationMode = 'orbit';
  if (walkControls.isLocked) walkControls.unlock();
  keys.clear();
  currentLookObject = null;
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

        house.traverse((node) => {
          if (!node.isMesh) return;
          node.castShadow = true;
          node.receiveShadow = true;
          collisionMeshes.push(node);
          if (!isCeiling(node)) groundMeshes.push(node);
          if (isWalkable(node)) walkableMeshes.push(node);
        });

        scene.add(house);
        frameObject(house);
        applyVisibility();
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

modeControls.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-mode]');
  if (!button || !house) return;
  if (button.dataset.mode === 'walk') enterWalkMode();
  else exitWalkMode();
});

walkControls.addEventListener('lock', () => {
  if (navigationMode !== 'walk') return;
  pointerLockCard.hidden = true;
});

walkControls.addEventListener('unlock', () => {
  keys.clear();
  if (navigationMode === 'walk') pointerLockCard.hidden = false;
});

resumeWalkButton.addEventListener('click', () => {
  if (navigationMode === 'walk') walkControls.lock();
});

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

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObject(house, true).filter((hit) => hit.object.visible);
  if (hits.length) selectObject(hits[0].object);
  else clearSelection();
});

window.addEventListener('keydown', (event) => {
  if (navigationMode !== 'walk') return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
    keys.add(event.code);
    event.preventDefault();
  }
  if (event.code === 'KeyE' && currentLookObject) {
    selectObject(currentLookObject);
    event.preventDefault();
  }
  if (event.code === 'KeyR') {
    respawnWalk();
    event.preventDefault();
  }
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
});

window.addEventListener('blur', () => keys.clear());

function resize() {
  const width = mount.clientWidth;
  const height = mount.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(mount);
renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  if (navigationMode === 'orbit') orbitControls.update();
  else {
    updateWalkMovement(delta);
    updatePOVTarget();
  }
  if (selectionHelper) selectionHelper.update();
  renderer.render(scene, camera);
});
