import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from '../vendor/three/addons/controls/OrbitControls.js';
import { buildKoalaAppearance, disposeKoalaTree, normalizeKoala } from './koala-appearance.mjs';
import { getWardrobe } from './core/wardrobe-rules.mjs';

export function mountWardrobePreview(host, initialGame) {
  const canvas = host.querySelector('canvas'), status = host.querySelector('.wardrobe-preview-status'), retry = host.querySelector('[data-preview-control="retry"]');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
  catch {
    status.textContent = '试衣镜无法启动，请开启浏览器图形加速后重新打开衣橱。仍可选择和保存搭配。';
    return { update() {}, dispose() {} };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf2efe4);
  const camera = new THREE.PerspectiveCamera(34, 1, .05, 30);
  const controls = new OrbitControls(camera, canvas); controls.enablePan = false;
  controls.minDistance = 1.2; controls.maxDistance = 7; controls.minPolarAngle = .55; controls.maxPolarAngle = 1.85;
  scene.add(new THREE.HemisphereLight(0xf5f8ff, 0xa49c82, 2.6));
  const sun = new THREE.DirectionalLight(0xfff0dc, 3); sun.position.set(-3, 5, 5); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 1.2); fill.position.set(3, 2, -3); scene.add(fill);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(.78, .83, .09, 64), new THREE.MeshStandardMaterial({ color: 0xdcd7c5, roughness: 1 }));
  stand.position.y = -.045; scene.add(stand);
  let game = initialGame, model, appearance, fingerprint = '', disposed = false, loading = false;
  function render() { if (!disposed) renderer.render(scene, camera); }
  function frame(mode = 'full') {
    controls.target.set(0, mode === 'face' ? 1.59 : .95, 0);
    camera.position.set(mode === 'face' ? 0 : .18, mode === 'face' ? 1.61 : 1.1, mode === 'face' ? 2.1 : 4.8);
    controls.update(); render();
  }
  function resize() {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render();
  }
  function update(nextGame) {
    game = nextGame;
    const next = JSON.stringify(getWardrobe(game).equipped);
    if (!model || fingerprint === next) return;
    if (appearance) { model.remove(appearance); disposeKoalaTree(appearance); }
    appearance = buildKoalaAppearance(model, game); model.add(appearance); fingerprint = next;
    host.dataset.equipped = next; render();
  }
  async function load() {
    if (loading || model || disposed) return;
    loading = true; retry.hidden = true; status.hidden = false; status.textContent = '考拉正在试衣镜前等你…';
    try {
      const gltf = await new GLTFLoader().loadAsync(new URL('../assets/models/koala-main/koala-main.glb', import.meta.url).href);
      if (disposed) { disposeKoalaTree(gltf.scene); return; }
      model = normalizeKoala(gltf.scene); scene.add(model); update(game);
      status.hidden = true; host.dataset.modelLoaded = 'true'; render();
    } catch (error) {
      if (!disposed) { status.textContent = '试衣镜加载失败，仍可选择和保存搭配。'; retry.hidden = false; console.error('试衣镜加载失败', error); }
    } finally { loading = false; }
  }
  function onClick(event) {
    const action = event.target.closest('[data-preview-control]')?.dataset.previewControl;
    if (action === 'full' || action === 'face') frame(action);
    if (action === 'left' || action === 'right') {
      camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), action === 'left' ? -.5 : .5).add(controls.target);
      controls.update(); render();
    }
    if (action === 'retry') void load();
  }
  function contextLost(event) {
    event.preventDefault(); status.hidden = false; retry.hidden = true;
    status.textContent = '试衣镜图形连接中断，请关闭衣橱再打开。当前搭配已保留。';
  }
  controls.addEventListener('change', render); host.addEventListener('click', onClick);
  canvas.addEventListener('webglcontextlost', contextLost);
  const observer = new ResizeObserver(resize); observer.observe(host);
  frame(); resize(); void load();
  return { update, dispose() {
    disposed = true; observer.disconnect(); controls.removeEventListener('change', render); controls.dispose();
    host.removeEventListener('click', onClick); canvas.removeEventListener('webglcontextlost', contextLost);
    disposeKoalaTree(scene); renderer.dispose(); renderer.forceContextLoss();
  } };
}
