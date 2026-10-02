// three.js view. Stickers stay in fixed slots and are recolored from the store state after each move;
// during a move the turning layer's meshes are parked in a group that rotates by the eased progress.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FACELETS, parseMove, type State, type Vec3 } from '../core/cube.ts';
import type { Anim, Store } from '../store.ts';
import { candidateDirs, dragToMove } from './drag.ts';
import { ease } from './ease.ts';

export interface CubeView { render(anim: Anim | null): void }

const DRAG_START_PX = 8;
const ORBIT_SPEED = 0.008;
const AXES = ['x', 'y', 'z'] as const;

function stickerShape(size: number, radius: number): THREE.Shape {
  const h = size / 2;
  const s = new THREE.Shape();
  s.moveTo(-h + radius, -h);
  s.lineTo(h - radius, -h);
  s.quadraticCurveTo(h, -h, h, -h + radius);
  s.lineTo(h, h - radius);
  s.quadraticCurveTo(h, h, h - radius, h);
  s.lineTo(-h + radius, h);
  s.quadraticCurveTo(-h, h, -h, h - radius);
  s.lineTo(-h, -h + radius);
  s.quadraticCurveTo(-h, -h, -h + radius, -h);
  return s;
}

// Returns null when WebGL is unavailable; the caller shows a notice and the ring view keeps working.
export function createCube3D(host: HTMLElement, store: Store, colors: string[], plastic: string): CubeView | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const canvas = renderer.domElement;
  host.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x30343a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(4, 6, 8);
  scene.add(sun);

  const root = new THREE.Group();
  root.rotation.set(0.5, -0.65, 0); // shows U, F and R
  scene.add(root);
  const turn = new THREE.Group();
  root.add(turn);
  const pieces: THREE.Mesh[] = [];

  const bodyGeo = new RoundedBoxGeometry(0.96, 0.96, 0.96, 3, 0.1);
  const bodyMat = new THREE.MeshStandardMaterial({ color: plastic, roughness: 0.6 });
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(x, y, z);
    root.add(body);
    pieces.push(body);
  }

  const stickerGeo = new THREE.ShapeGeometry(stickerShape(0.82, 0.12));
  const stickerMats = colors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 }));
  const stickers = FACELETS.map(({ p, n }, i) => {
    const m = new THREE.Mesh(stickerGeo, stickerMats[0]);
    m.position.set(p[0] + n[0] * 0.485, p[1] + n[1] * 0.485, p[2] + n[2] * 0.485);
    m.lookAt(m.position.x + n[0], m.position.y + n[1], m.position.z + n[2]); // before parenting: local space
    m.userData.facelet = i;
    root.add(m);
    pieces.push(m);
    return m;
  });

  let dirty = true;
  const paint = (s: State) => {
    stickers.forEach((m, i) => { m.material = stickerMats[s[i]]; });
    dirty = true;
  };
  paint(store.state);
  store.subscribe((s) => paint(s));

  new ResizeObserver(() => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, 0, w < h ? 11 * (h / w) : 11);
    camera.updateProjectionMatrix();
    dirty = true;
  }).observe(host);

  // --- pointer: drag background = orbit, drag sticker = turn its layer
  const ray = new THREE.Raycaster();
  const toPixels = (local: THREE.Vector3) => {
    const v = local.applyMatrix4(root.matrixWorld).project(camera);
    return new THREE.Vector2(((v.x + 1) / 2) * canvas.clientWidth, ((1 - v.y) / 2) * canvas.clientHeight);
  };
  const pickFacelet = (e: PointerEvent): number => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(stickers, false)[0];
    return hit ? (hit.object.userData.facelet as number) : -1;
  };
  const stickerDrag = (i: number, drag: THREE.Vector2) => {
    const { p, n } = FACELETS[i];
    root.updateMatrixWorld();
    const surface = new THREE.Vector3(p[0] + n[0] / 2, p[1] + n[1] / 2, p[2] + n[2] / 2);
    const origin = toPixels(surface.clone());
    let best: Vec3 | null = null;
    let bestScore = -Infinity;
    for (const d of candidateDirs(n)) {
      const screen = toPixels(surface.clone().add(new THREE.Vector3(...d))).sub(origin).normalize();
      const score = screen.dot(drag);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best && dragToMove(n, p, best);
  };

  let gesture: { facelet: number; x: number; y: number; done: boolean } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    gesture = { facelet: pickFacelet(e), x: e.clientX, y: e.clientY, done: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!gesture) return;
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
    if (gesture.facelet < 0) {
      const q = new THREE.Quaternion();
      root.quaternion.premultiply(q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * ORBIT_SPEED));
      root.quaternion.premultiply(q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * ORBIT_SPEED));
      gesture.x = e.clientX;
      gesture.y = e.clientY;
      dirty = true;
      return;
    }
    if (gesture.done || Math.hypot(dx, dy) < DRAG_START_PX) return;
    const move = stickerDrag(gesture.facelet, new THREE.Vector2(dx, dy).normalize());
    if (move) store.enqueue(move);
    gesture.done = true;
  });
  const end = () => { gesture = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // --- animation
  let shownId = 0;
  const releaseLayer = () => {
    turn.rotation.set(0, 0, 0);
    [...turn.children].forEach((c) => root.add(c)); // turn is identity here, so local transforms stay exact
  };
  const grabLayer = (anim: Anim) => {
    const { axis, layers } = parseMove(anim.move);
    for (const m of pieces) if (layers.includes(Math.round(m.position[AXES[axis]]))) turn.add(m);
  };

  return {
    render(anim) {
      const id = anim?.id ?? 0;
      if (id !== shownId) {
        releaseLayer();
        if (anim) grabLayer(anim);
        shownId = id;
        dirty = true;
      }
      if (anim) {
        const { axis, dir, turns } = parseMove(anim.move);
        turn.rotation.set(0, 0, 0);
        turn.rotation[AXES[axis]] = dir * turns * (Math.PI / 2) * ease(anim.t);
        dirty = true;
      }
      if (dirty) {
        renderer.render(scene, camera);
        dirty = false;
      }
    },
  };
}
