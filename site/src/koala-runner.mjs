import * as THREE from '../vendor/three/three.module.js';
import { buildKoalaKnitwear } from './koala-knitwear.mjs';

const CORAL = 0xe47758, GREEN = 0x315d51, CREAM = 0xf5ecd4;

function fabricTexture() {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, hole = x % 8 < 2 && y % 8 < 2;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = hole ? 110 : 215; pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(5, 3);
  texture.needsUpdate = true; return texture;
}

// 号码布直接用像素字生成，场景和 Node 几何校验都无需 canvas。
function bibTexture() {
  const width = 128, height = 88, pixels = new Uint8Array(width * height * 4);
  const ink = [40, 80, 67], paper = [250, 244, 223], coral = [228, 119, 88];
  function dot(x, y, color) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = ((height - 1 - y) * width + x) * 4;
    pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) dot(x, y, x < 3 || x >= width - 3 || y < 3 || y >= height - 3 ? coral : paper);
  const glyphs = {
    K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  };
  function text(value, y, scale) {
    const start = Math.floor((width - (value.length * 6 - 1) * scale) / 2);
    [...value].forEach((letter, i) => glyphs[letter].forEach((row, dy) => [...row].forEach((on, dx) => {
      if (on === '1') for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) dot(start + (i * 6 + dx) * scale + sx, y + dy * scale + sy, ink);
    })));
  }
  text('KOALA', 12, 3); text('01', 43, 5);
  const texture = new THREE.DataTexture(pixels, width, height);
  texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true; return texture;
}

function mesh(group, name, geometry, material) {
  const result = new THREE.Mesh(geometry, material); result.name = name;
  result.castShadow = true; result.receiveShadow = true; group.add(result); return result;
}

function tube(group, name, points, radius, material, closed = false) {
  return mesh(group, name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed, 'centripetal'), Math.max(24, points.length * 3), radius, 8, closed), material);
}

// 有内外两层和封边的贴合拼片；point(u,v,side) 返回装扮局部坐标。
function panelGeometry(point, columns = 16, rows = 12) {
  const positions = [], uv = [], indices = [], layerSize = (columns + 1) * (rows + 1);
  for (let side = 0; side < 2; side++) for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const u = column / columns, v = row / rows;
    positions.push(...point(u, v, side).toArray()); uv.push(u, v);
  }
  const face = (a, b, c, d) => indices.push(a, b, d, a, d, c);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = row * (columns + 1) + column, b = a + 1, c = a + columns + 1, d = c + 1;
    face(a, b, c, d); face(a + layerSize, c + layerSize, b + layerSize, d + layerSize);
  }
  const edge = [];
  for (let column = 0; column <= columns; column++) edge.push(column);
  for (let row = 1; row <= rows; row++) edge.push(row * (columns + 1) + columns);
  for (let column = columns - 1; column >= 0; column--) edge.push(rows * (columns + 1) + column);
  for (let row = rows - 1; row > 0; row--) edge.push(row * (columns + 1));
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i], b = edge[(i + 1) % edge.length];
    face(b, a, b + layerSize, a + layerSize);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function buildKoalaTrailRunner(model) {
  const group = new THREE.Group(); group.name = 'koala-trail-runner';
  const texture = fabricTexture();
  const fabric = new THREE.MeshStandardMaterial({ color: CORAL, roughness: .82, bumpMap: texture, bumpScale: .0025 });
  const binding = new THREE.MeshStandardMaterial({ color: GREEN, roughness: .85 });
  const cream = new THREE.MeshStandardMaterial({ color: CREAM, roughness: .82 });
  const reflective = new THREE.MeshStandardMaterial({ color: 0xe5e9d9, roughness: .38, metalness: .15 });
  // 只复用已经验证闭合的衣身与包边几何，针织口袋、木扣及纹理均释放。
  const knit = buildKoalaKnitwear(model, CORAL), stop = knit.children.findIndex((item) => item.name === 'knit-pocket');
  const retained = knit.children.slice(0, stop), keptGeometry = new Set(retained.map((item) => item.geometry));
  const oldMaterials = new Set(), oldTextures = new Set();
  knit.traverse((item) => {
    if (item.geometry && !keptGeometry.has(item.geometry)) item.geometry.dispose();
    if (!item.material) return;
    oldMaterials.add(item.material);
    for (const value of Object.values(item.material)) if (value?.isTexture) oldTextures.add(value);
  });
  for (const material of oldMaterials) material.dispose();
  for (const oldTexture of oldTextures) oldTexture.dispose();
  retained.forEach((item, i) => { item.name = i ? `runner-binding-${i}` : 'runner-shell'; item.material = i ? binding : fabric; group.add(item); });
  const shell = retained[0], ray = new THREE.Raycaster(), samples = new Map();
  function surface(theta, y, lift = .01) {
    const direction = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
    const key = `${theta.toFixed(7)},${y.toFixed(7)}`;
    if (!samples.has(key)) {
      ray.set(new THREE.Vector3(direction.x * 1.4, y, -.08 + direction.z * 1.4), direction.clone().negate());
      const hit = ray.intersectObject(shell, false)[0];
      samples.set(key, hit?.point.clone() || new THREE.Vector3(direction.x * .51, y, -.08 + direction.z * .51));
    }
    // 所有拼片都限制在衣身连续区域；余量覆盖边界采样的浮点误差。
    return samples.get(key).clone().addScaledVector(direction, lift);
  }
  function panel(name, thetaAt, minY, maxY, halfWidth, material, lift = () => .024) {
    const point = (u, v, side) => surface(thetaAt(v) + (u * 2 - 1) * halfWidth, THREE.MathUtils.lerp(minY, maxY, v), side ? .006 : lift(u, v));
    const result = mesh(group, name, panelGeometry(point), material);
    return { result, point };
  }
  for (const side of [-1, 1]) {
    const label = side < 0 ? 'left' : 'right';
    const strap = panel(`runner-shoulder-strap-${label}`, (v) => side * (.37 + .45 * Math.pow(v, 1.65)), .52, .92, .10, binding);
    tube(group, `runner-reflective-strap-${label}`, Array.from({ length: 14 }, (_, i) => strap.point(.22, .10 + i / 13 * .69, 0).add(new THREE.Vector3(0, 0, .006))), .006, reflective);
    panel(`runner-vent-${label}`, () => side * 1.05, .48, .60, .15, cream, () => .013);
    panel(`runner-flask-pocket-${label}`, () => side * .39, .575, .695, .12, binding, () => .054);
    const flask = new THREE.Group(); flask.name = `runner-soft-flask-${label}`;
    flask.position.copy(surface(side * .39, .708, .065)); group.add(flask);
    const soft = mesh(flask, `runner-flask-body-${label}`, new THREE.SphereGeometry(1, 24, 16), cream); soft.scale.set(.043, .084, .032);
    const neck = mesh(flask, `runner-flask-neck-${label}`, new THREE.CylinderGeometry(.015, .024, .038, 16), binding); neck.position.y = .092;
    const cap = mesh(flask, `runner-flask-cap-${label}`, new THREE.CylinderGeometry(.019, .019, .014, 16), reflective); cap.position.y = .118;
    const seam = tube(group, `runner-zip-${label}`, Array.from({ length: 12 }, (_, i) => surface(side * (.13 + i / 11 * .06), .67 + i / 11 * .06, .023)), .004, cream);
    seam.userData.detail = '防水拉链';
  }
  const pack = panel('runner-hydration-pack', () => Math.PI, .54, 1.005, .49, binding, (u, v) => .025 + .07 * Math.pow(Math.sin(Math.PI * u) * Math.sin(Math.PI * v), .7));
  tube(group, 'runner-pack-reflector', Array.from({ length: 18 }, (_, i) => pack.point(.25 + i / 17 * .5, .55, 0).add(new THREE.Vector3(0, 0, -.008))), .009, reflective);
  tube(group, 'runner-pack-zip', Array.from({ length: 20 }, (_, i) => pack.point(.5, .15 + i / 19 * .7, 0).add(new THREE.Vector3(0, 0, -.006))), .004, cream);
  const bibMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .88, map: bibTexture() });
  panel('runner-bib', () => 0, .475, .635, .255, bibMaterial, () => .023);
  for (const theta of [-.215, .215]) for (const y of [.49, .62]) {
    const pin = mesh(group, 'runner-bib-pin', new THREE.SphereGeometry(.006, 10, 8), binding); pin.position.copy(surface(theta, y, .033));
  }
  return group;
}

export function buildKoalaTrailVisor(model) {
  const group = new THREE.Group(); group.name = 'koala-trail-visor';
  const coral = new THREE.MeshStandardMaterial({ color: CORAL, roughness: .82 });
  const cream = new THREE.MeshStandardMaterial({ color: CREAM, roughness: .78 });
  const green = new THREE.MeshStandardMaterial({ color: GREEN, roughness: .85 });
  const probe = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const surfaces = model.children.filter((item) => item.isMesh).map((item) => new THREE.Mesh(item.geometry, probe));
  const ray = new THREE.Raycaster(), samples = new Map();
  function scalp(theta, y, lift = .018) {
    const direction = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
    const key = `${theta.toFixed(7)},${y.toFixed(7)}`;
    if (!samples.has(key)) {
      ray.set(new THREE.Vector3(0, y, -.08), direction);
      // 从头内向外取第一个外表面，跳过远处耳朵，帽带便不会套到耳朵上。
      const hit = ray.intersectObjects(surfaces, false).find((item) => item.face.normal.dot(direction) > .05);
      samples.set(key, Math.min(hit?.distance || .32, .44));
    }
    const radius = samples.get(key) + lift;
    return new THREE.Vector3(direction.x * radius, y, -.08 + direction.z * radius);
  }
  const band = panelGeometry((u, v, side) => scalp(u * Math.PI * 2, 1.967 + v * .05, side ? .009 : .025), 80, 5);
  mesh(group, 'runner-visor-band', band, coral);
  const brimPoint = (u, v, side) => {
    const theta = (.5 - u) * Math.PI, base = scalp(theta, 1.97, .018), front = Math.max(.08, Math.cos(theta));
    const extension = .225 * Math.pow(front, .65) * v;
    base.x += Math.sin(theta) * extension * .65; base.z += Math.cos(theta) * extension;
    base.y -= .026 * front * v + (side ? .015 : 0); return base;
  };
  mesh(group, 'runner-visor-brim', panelGeometry(brimPoint, 48, 10), cream);
  tube(group, 'runner-visor-piping', Array.from({ length: 49 }, (_, i) => brimPoint(i / 48, 1, 0)), .008, green);
  probe.dispose(); return group;
}
