import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.screenSpacePanning = true;
controls.minDistance = 1;
controls.maxDistance = 60;

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
const pointer = new THREE.Vector2();
let pointerDown = null;
let house = null;
let initialView = null;
let selectionHelper = null;
let selectedObject = null;

function frameObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z);
  const distance = radius / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.35;
  const direction = new THREE.Vector3(1, 0.7, 1).normalize();
  camera.position.copy(center).add(direction.multiplyScalar(distance));
  controls.target.copy(center);
  camera.near = Math.max(radius / 1000, 0.01);
  camera.far = radius * 100;
  camera.updateProjectionMatrix();
  controls.update();
  initialView = { position: camera.position.clone(), target: controls.target.clone() };
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
        house.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
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

document.querySelector('#floor-controls').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-floor]');
  if (!button) return;
  document.querySelectorAll('#floor-controls button').forEach((b) => b.classList.remove('active'));
  button.classList.add('active');
  applyVisibility();
});

document.querySelector('#ceilings').addEventListener('change', applyVisibility);
document.querySelector('#reset').addEventListener('click', () => {
  if (!initialView) return;
  camera.position.copy(initialView.position);
  controls.target.copy(initialView.target);
  controls.update();
});
clearSelectionButton.addEventListener('click', clearSelection);

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  pointerDown = { x: event.clientX, y: event.clientY };
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (event.button !== 0 || !pointerDown || !house) return;
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

function resize() {
  const width = mount.clientWidth;
  const height = mount.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(mount);
renderer.setAnimationLoop(() => {
  controls.update();
  if (selectionHelper) selectionHelper.update();
  renderer.render(scene, camera);
});
