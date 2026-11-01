import * as THREE from '../vendor/three/three.module.js';
import { getWardrobe, WARDROBE_CATALOG } from './core/wardrobe-rules.mjs';
import { buildKoalaKnitwear } from './koala-knitwear.mjs';
import { buildKoalaTrailRunner, buildKoalaTrailVisor } from './koala-runner.mjs';

export function disposeKoalaTree(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse((item) => {
    if (item.geometry) geometries.add(item.geometry);
    for (const material of [item.material].flat().filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const texture of textures) { texture.dispose(); texture.source?.data?.close?.(); }
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

// 世界与试衣镜统一为脚底 y=0、身高 2.15、面向 +Z。
export function normalizeKoala(model) {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model), center = bounds.getCenter(new THREE.Vector3());
  const scale = 2.15 / (bounds.max.y - bounds.min.y);
  const result = new THREE.Group();
  model.traverse((item) => {
    if (!item.isMesh) return;
    const geometry = item.geometry.clone().applyMatrix4(item.matrixWorld);
    geometry.translate(-center.x, -bounds.min.y, -center.z).scale(scale, scale, scale);
    const material = item.material.clone(); material.roughness = .88; material.metalness = 0;
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true;
    result.add(mesh);
    item.geometry.dispose(); item.material.dispose();
  });
  return result;
}

export function buildKoalaAppearance(model, game) {
  const equipped = getWardrobe(game).equipped;
  const group = new THREE.Group(); group.name = 'koala-wardrobe';
  group.userData.equipped = { ...equipped };
  const ray = new THREE.Raycaster(), direction = new THREE.Vector3(0, 0, -1);
  model.updateMatrixWorld(true);
  // normalized model 尚未挂到 actor 时矩阵为单位；在世界中用局部几何探测，避免角色位置影响贴合。
  const surfaces = model.children.filter((mesh) => mesh.isMesh).map((mesh) => new THREE.Mesh(mesh.geometry, mesh.material));
  function surface(x, y, offset = .01) {
    ray.set(new THREE.Vector3(x, y, 2), direction);
    const hit = ray.intersectObjects(surfaces, false)[0];
    return hit ? hit.point.clone().addScaledVector(hit.normal || hit.face.normal, offset) : null;
  }
  function ellipsoid(color, position, scale) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), new THREE.MeshStandardMaterial({ color, roughness: .9 }));
    mesh.position.copy(position); mesh.scale.set(...scale); mesh.castShadow = true; group.add(mesh); return mesh;
  }
  function patch(x, y, rx, ry, color, opacity = .7, star = false) {
    const center = surface(x, y), points = [];
    if (!center) return;
    const count = star ? 10 : 32;
    for (let i = 0; i < count; i++) {
      const angle = Math.PI / 2 + i * Math.PI * 2 / count, radius = star && i % 2 ? .45 : 1;
      const point = surface(x + Math.cos(angle) * rx * radius, y + Math.sin(angle) * ry * radius);
      if (!point) return;
      points.push(point);
    }
    const values = [];
    for (let i = 0; i < count; i++) values.push(...center.toArray(), ...points[i].toArray(), ...points[(i + 1) % count].toArray());
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); geometry.computeVertexNormals();
    group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, transparent: true, opacity, depthWrite: false, roughness: 1, side: THREE.DoubleSide })));
  }
  if (equipped.outfit === 'trail-runner') {
    group.add(buildKoalaTrailRunner(model));
  } else if (equipped.outfit !== 'forest-original') {
    const knitwear = buildKoalaKnitwear(model, WARDROBE_CATALOG.find((item) => item.id === equipped.outfit).color);
    group.add(...knitwear.children.slice());
  }
  if (equipped.headwear === 'trail-visor') group.add(buildKoalaTrailVisor(model));
  if (equipped.headwear === 'leaf-beret') {
    ellipsoid(0x718b61, new THREE.Vector3(.02, 2.055, -.07), [.46, .13, .36]);
    ellipsoid(0x526b43, new THREE.Vector3(.04, 2.19, -.07), [.033, .065, .033]);
    const leaf = ellipsoid(0xabc18a, new THREE.Vector3(.26, 2.12, .18), [.11, .035, .05]); leaf.rotation.z = -.4;
  }
  if (equipped.headwear === 'flower-clip') {
    const center = surface(.62, 1.96, .045) || new THREE.Vector3(.62, 1.96, .16);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      const petal = ellipsoid(0xfff4d6, center.clone().add(new THREE.Vector3(Math.cos(angle) * .08, Math.sin(angle) * .08, 0)), [.07, .04, .025]); petal.rotation.z = angle;
    }
    ellipsoid(0xe4bd5b, center.clone().add(new THREE.Vector3(0, 0, .026)), [.05, .05, .025]);
  }
  for (const side of [-1, 1]) {
    if (equipped.makeup === 'peach-blush') patch(side * .32, 1.43, .085, .042, 0xe8909b, .6);
    if (equipped.makeup === 'star-freckles') {
      patch(side * .32, 1.43, .043, .043, 0xd5a346, .95, true);
      for (const [x, y] of [[.40, 1.47], [.39, 1.41]]) patch(side * x, y, .013, .013, 0xc2954c, .9);
    }
    if (equipped.makeup === 'lavender-eyeshadow') patch(side * .23, 1.665, .077, .027, 0xa68ac2, .65);
  }
  return group;
}
