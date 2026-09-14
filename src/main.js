import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import './style.css';

const mount = document.querySelector('#canvas-wrap');
const status = document.querySelector('#status');
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

let house = null;
let initialView = null;

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
  renderer.render(scene, camera);
});
