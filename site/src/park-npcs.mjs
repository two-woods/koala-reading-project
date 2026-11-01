import * as THREE from '../vendor/three/three.module.js';
import { PARK_NPCS } from './core/park-catalog.mjs';

// 三位居民使用本地几何体；不额外加载模型、贴图或网络资源。
const palette = { cream: 0xf3e6ce, rabbit: 0xd8c6b4, pink: 0xd6a69a, green: 0x799d88, fox: 0xc88b5c, dark: 0x413b36, owl: 0x9d8068, yellow: 0xdfbb64 };

export function buildParkNpcs() {
  const residents = new THREE.Group();
  const materials = Object.fromEntries(Object.entries(palette).map(([key, color]) => [key, new THREE.MeshStandardMaterial({ color, roughness: .9 })]));
  const sphere = (parent, color, x, y, z, sx, sy, sz) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), materials[color]);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const cone = (parent, color, x, y, z, radius, height) => {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 3), materials[color]);
    mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  for (const npc of PARK_NPCS) {
    const root = new THREE.Group(); root.position.set(npc.position.x, .04, npc.position.z); root.userData.npcId = npc.id;
    const body = new THREE.Group(); root.add(body); root.userData.body = body;
    if (npc.id === 'rabbit-guide') {
      sphere(body, 'green', 0, .8, 0, .45, .62, .34);
      sphere(body, 'rabbit', 0, 1.6, .04, .48, .45, .39);
      for (const x of [-.24, .24]) {
        sphere(body, 'rabbit', x, 2.13, -.02, .14, .52, .13).rotation.z = -x * .4;
        sphere(body, 'pink', x, 2.18, .095, .07, .34, .035).rotation.z = -x * .4;
        sphere(body, 'rabbit', x, .16, .14, .18, .17, .3);
        sphere(body, 'cream', x * .6, 1.48, .39, .16, .14, .12);
        sphere(body, 'dark', x * .77, 1.67, .385, .045, .065, .035);
      }
      sphere(body, 'pink', 0, 1.52, .5, .065, .05, .04);
      sphere(body, 'rabbit', -.45, .93, .07, .14, .37, .15).rotation.z = -.3;
      sphere(body, 'rabbit', .43, 1.08, .07, .14, .37, .15).rotation.z = -.55;
      sphere(body, 'cream', 0, .75, -.34, .2, .2, .19);
    } else if (npc.id === 'fox-shopkeeper') {
      sphere(body, 'green', 0, .82, 0, .46, .61, .35);
      sphere(body, 'fox', 0, 1.6, 0, .49, .45, .4);
      for (const x of [-.3, .3]) {
        cone(body, 'fox', x, 2.04, -.02, .25, .6).rotation.z = -x * .4;
        cone(body, 'cream', x, 2.05, .1, .13, .35).rotation.z = -x * .4;
        sphere(body, 'cream', x * .55, 1.44, .32, .24, .21, .25);
        sphere(body, 'dark', x * .66, 1.67, .37, .05, .065, .035);
        sphere(body, 'dark', x * .7, .15, .1, .17, .16, .28);
        sphere(body, 'fox', x * 1.55, .92, .02, .15, .37, .15).rotation.z = -x;
      }
      sphere(body, 'dark', 0, 1.45, .57, .09, .06, .05);
      const tail = sphere(body, 'fox', .5, .55, -.25, .22, .56, .24); tail.rotation.z = -.85;
      sphere(body, 'cream', .83, .84, -.27, .18, .22, .19).rotation.z = -.85;
      sphere(body, 'yellow', 0, 1.13, .35, .1, .12, .025);
    } else {
      sphere(body, 'owl', 0, 1.05, 0, .59, .76, .46);
      sphere(body, 'cream', 0, .9, .37, .36, .48, .1);
      for (const x of [-.25, .25]) {
        sphere(body, 'cream', x, 1.57, .3, .31, .32, .17);
        sphere(body, 'dark', x, 1.57, .46, .08, .1, .035);
        sphere(body, 'cream', x - .02, 1.6, .49, .025, .03, .015);
        sphere(body, 'yellow', x * .8, .2, .18, .17, .1, .23);
        cone(body, 'owl', x * 1.4, 1.99, -.04, .18, .42).rotation.z = -x;
        sphere(body, 'owl', x * 2.2, 1.05, .04, .16, .49, .3).rotation.z = x;
      }
      const beak = cone(body, 'yellow', 0, 1.33, .48, .13, .25); beak.rotation.x = Math.PI * .5;
      sphere(body, 'green', 0, 1.99, 0, .37, .08, .32);
    }
    residents.add(root);
  }
  return residents;
}

export function animateParkNpcs(residents, elapsed) {
  residents.children.forEach((root, index) => {
    const body = root.userData.body;
    body.position.y = Math.sin(elapsed * 1.6 + index * 1.8) * .035;
    body.rotation.y = Math.sin(elapsed * .45 + index) * .12;
    body.rotation.z = Math.sin(elapsed * .9 + index * 2) * .025;
  });
}
