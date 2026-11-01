import * as THREE from '../vendor/three/three.module.js';

const BASE_Y = .44, TOP_Y = 1.09, PROFILE_ROWS = 16, PROFILE_COLUMNS = 40;
const profiles = new WeakMap();

function knitTexture() {
  const size = 256, pixels = new Uint8Array(size * size * 4), colors = new Uint8Array(size * size * 4), ribs = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size * 16) % 1 - .5, v = (y / size * 24) % 1;
    const strand = Math.exp(-Math.pow((Math.abs(u) - .38 * v) / .065, 2));
    const height = 100 + 115 * strand * Math.sin(Math.PI * v) + 5 * Math.sin(x * 2.1 + y * 1.7);
    const i = (y * size + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = height; pixels[i + 3] = 255;
    colors[i] = colors[i + 1] = colors[i + 2] = 218 + height * .16; colors[i + 3] = 255;
    ribs[i] = ribs[i + 1] = ribs[i + 2] = 128 + 70 * Math.cos(x / size * Math.PI * 128); ribs[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter; texture.anisotropy = 4; texture.needsUpdate = true;
  const color = new THREE.DataTexture(colors, size, size);
  color.wrapS = color.wrapT = THREE.RepeatWrapping; color.colorSpace = THREE.SRGBColorSpace;
  color.generateMipmaps = true; color.minFilter = THREE.LinearMipmapLinearFilter; color.needsUpdate = true;
  const rib = new THREE.DataTexture(ribs, size, size);
  rib.wrapS = rib.wrapT = THREE.RepeatWrapping; rib.generateMipmaps = true;
  rib.minFilter = THREE.LinearMipmapLinearFilter; rib.needsUpdate = true;
  return { bump: texture, color, rib };
}

function bodyProfile(model) {
  if (profiles.has(model)) return profiles.get(model);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = model.children.filter((mesh) => mesh.isMesh).map((mesh) => new THREE.Mesh(mesh.geometry, material));
  const ray = new THREE.Raycaster(), values = [];
  for (let row = 0; row <= PROFILE_ROWS; row++) {
    const y = BASE_Y + (TOP_Y - BASE_Y) * row / PROFILE_ROWS, radii = [];
    const level = row / PROFILE_ROWS;
    const halfWidth = .50 - .04 * Math.sin(Math.PI * level) + .035 * Math.pow(level, 6);
    for (let column = 0; column < PROFILE_COLUMNS; column++) {
      const theta = column / PROFILE_COLUMNS * Math.PI * 2;
      const direction = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
      ray.set(new THREE.Vector3(0, y, -.08), direction);
      // Tripo 身体包含重叠表面：使用朝外的外层交点，侧宽约束排除手臂。
      const hits = ray.intersectObjects(meshes, false).filter((hit) => hit.face.normal.dot(direction) > .05);
      const measured = hits.at(-1)?.distance || .4;
      const sideLimit = halfWidth / Math.max(.001, Math.abs(direction.x));
      radii.push(Math.min(measured, sideLimit, .64));
    }
    // 抑制生成网格的小凹陷，保留圆润轮廓；衣身另有余量与内衬。
    values.push(radii.map((r, i) => r * .6 + radii[(i + PROFILE_COLUMNS - 1) % PROFILE_COLUMNS] * .2 + radii[(i + 1) % PROFILE_COLUMNS] * .2));
  }
  material.dispose();
  const point = (theta, y, offset = .055) => {
    const wrapped = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const u = wrapped / (Math.PI * 2) * PROFILE_COLUMNS;
    const v = THREE.MathUtils.clamp((y - BASE_Y) / (TOP_Y - BASE_Y), 0, 1) * PROFILE_ROWS;
    const a = Math.floor(u), b = Math.min(PROFILE_ROWS - 1, Math.floor(v)), t = u - a, s = v - b;
    const low = THREE.MathUtils.lerp(values[b][a], values[b][(a + 1) % PROFILE_COLUMNS], t);
    const high = THREE.MathUtils.lerp(values[b + 1][a], values[b + 1][(a + 1) % PROFILE_COLUMNS], t);
    const radius = THREE.MathUtils.lerp(low, high, s) + offset;
    return new THREE.Vector3(Math.sin(theta) * radius, y, -.08 + Math.cos(theta) * radius);
  };
  profiles.set(model, point);
  return point;
}

function clipOutside(vertices, distance) {
  const result = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length], da = distance(a), db = distance(b);
    if (da >= 0) result.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db); result.push({ theta: THREE.MathUtils.lerp(a.theta, b.theta, t), y: THREE.MathUtils.lerp(a.y, b.y, t) });
    }
  }
  return result;
}

function knitShell(point, material) {
  const columns = 96, rows = 28, vertices = [], lookup = new Map(), faces = [], edges = new Map();
  function vertex(p) {
    const theta = Math.abs(p.theta - Math.PI * 2) < 1e-7 ? 0 : p.theta;
    const key = `${theta.toFixed(7)},${p.y.toFixed(7)}`;
    if (!lookup.has(key)) { lookup.set(key, vertices.length); vertices.push({ theta, y: p.y }); }
    return lookup.get(key);
  }
  function face(a, b, c) {
    const indices = [vertex(a), vertex(b), vertex(c)];
    if (new Set(indices).size !== 3) return;
    faces.push(...indices);
    for (let i = 0; i < 3; i++) {
      const from = indices[i], to = indices[(i + 1) % 3], key = [from, to].sort((x, y) => x - y).join(',');
      const edge = edges.get(key); if (edge) edge.count++; else edges.set(key, { from, to, count: 1 });
    }
  }
  function grid(column, row) {
    const theta = column / columns * Math.PI * 2;
    const collar = 1.08 - .32 * Math.pow(Math.max(0, Math.cos(theta)), 3);
    return { theta, y: BASE_Y + (collar - BASE_Y) * row / rows };
  }
  const armholes = [Math.PI / 2, Math.PI * 1.5].map((center) => (p) => Math.pow((p.theta - center) / .65, 2) + Math.pow((p.y - .80) / .22, 2) - 1);
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const a = grid(col, row), b = grid(col + 1, row), c = grid(col, row + 1), d = grid(col + 1, row + 1);
    for (let triangle of [[a, b, d], [a, d, c]]) {
      for (const hole of armholes) triangle = clipOutside(triangle, hole);
      for (let i = 1; i < triangle.length - 1; i++) face(triangle[0], triangle[i], triangle[i + 1]);
    }
  }
  const positions = [], uv = [], indices = [...faces], count = vertices.length;
  for (const offset of [.055, .028]) for (const p of vertices) {
    positions.push(...point(p.theta, p.y, offset).toArray()); uv.push(p.theta / Math.PI, (p.y - BASE_Y) * .65);
  }
  for (let i = 0; i < faces.length; i += 3) indices.push(faces[i + 2] + count, faces[i + 1] + count, faces[i] + count);
  const boundary = [...edges.values()].filter((edge) => edge.count === 1), next = new Map();
  for (const { from, to } of boundary) {
    indices.push(to, from, from + count, to, from + count, to + count);
    next.set(from, to);
  }
  const loops = [];
  while (next.size) {
    const start = next.keys().next().value, loop = []; let current = start;
    while (next.has(current)) { loop.push(point(vertices[current].theta, vertices[current].y)); const to = next.get(current); next.delete(current); current = to; }
    if (current === start && loop.length > 3) loops.push(loop);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'knit-shell'; mesh.castShadow = true; mesh.receiveShadow = true;
  return { mesh, loops };
}

export function buildKoalaKnitwear(model, color) {
  const group = new THREE.Group(), point = bodyProfile(model), texture = knitTexture();
  const fabric = new THREE.MeshStandardMaterial({ color, roughness: .94, map: texture.color, bumpMap: texture.bump, bumpScale: .012 });
  const binding = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(.87), roughness: .97, bumpMap: texture.rib, bumpScale: .003 });
  const stitch = new THREE.MeshStandardMaterial({ color: 0xf5ead2, roughness: .9 });
  const { mesh, loops } = knitShell(point, fabric); group.add(mesh);
  function tube(points, radius, material, closed = false) {
    const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, Math.min(240, points.length * 2)), radius, 8, closed), material);
    mesh.castShadow = true; group.add(mesh); return mesh;
  }
  for (const loop of loops) {
    const hem = loop.every((p) => p.y < BASE_Y + .001);
    tube(loop, hem ? .026 : .017, binding, true);
    if (hem) tube(loop.map((p) => p.clone().add(new THREE.Vector3(0, .026, 0))), .011, binding, true);
  }
  function front(x, y, lift = .016) {
    let low = -Math.PI / 2, high = Math.PI / 2;
    for (let i = 0; i < 18; i++) { const mid = (low + high) / 2; if (point(mid, y).x < x) low = mid; else high = mid; }
    return point((low + high) / 2, y, .055 + lift);
  }
  const shape = new THREE.Shape();
  shape.moveTo(-.08, .08); shape.lineTo(.08, .08); shape.lineTo(.08, -.035);
  shape.quadraticCurveTo(.08, -.08, .035, -.08); shape.lineTo(-.035, -.08); shape.quadraticCurveTo(-.08, -.08, -.08, -.035); shape.closePath();
  const pocket = new THREE.ExtrudeGeometry(shape, { depth: .015, bevelEnabled: true, bevelThickness: .004, bevelSize: .004, bevelSegments: 2, curveSegments: 8, steps: 1 });
  const pp = pocket.attributes.position;
  for (let i = 0; i < pp.count; i++) { const p = front(.235 + pp.getX(i), .60 + pp.getY(i), .012 + pp.getZ(i)); pp.setXYZ(i, p.x, p.y, p.z); }
  pocket.computeVertexNormals(); const pocketMesh = new THREE.Mesh(pocket, fabric); pocketMesh.name = 'knit-pocket'; group.add(pocketMesh);
  const outline = shape.getPoints(24).slice(0, -1).map((p) => front(.235 + p.x * .88, .60 + p.y * .88, .035));
  tube(outline, .0024, stitch, true);
  tube([front(.153, .68, .034), front(.235, .683, .034), front(.317, .68, .034)], .008, binding);
  tube([front(0, .455), front(0, .58), front(0, .69)], .012, binding);
  const wood = new THREE.MeshStandardMaterial({ color: 0xe0c397, roughness: .85 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x77916a, roughness: .95 });
  function bead(position, scale, material) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material); mesh.position.copy(position); mesh.scale.set(...scale); group.add(mesh); return mesh;
  }
  for (const y of [.49, .575, .66]) {
    bead(front(0, y, .034), [.022, .022, .010], wood);
    for (const x of [-.005, .005]) for (const dy of [-.005, .005]) bead(front(x, y + dy, .044), [.0024, .0024, .0015], binding);
  }
  tube([front(.235, .57, .044), front(.235, .63, .044)], .0026, leafMaterial);
  const left = bead(front(.220, .605, .045), [.019, .009, .0035], leafMaterial); left.rotation.z = -.55;
  const right = bead(front(.250, .625, .045), [.019, .009, .0035], leafMaterial); right.rotation.z = .55;
  return group;
}
