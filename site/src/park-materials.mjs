import * as THREE from '../vendor/three/three.module.js';

// 细纹在内存生成，无远端贴图和额外加载；每个材质持有独立纹理对象。
const pixels = new Map();
const fract = (value) => value - Math.floor(value);
const random = (x, y, seed = 1) => fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453);
const clamp = (value) => Math.max(0, Math.min(1, value));
const detail = {
  wood: { bump: .035, roughness: .78 }, bark: { bump: .075, roughness: .92 },
  stone: { bump: .045, roughness: .96 }, grass: { bump: .025, roughness: 1 },
  leaf: { bump: .014, roughness: .72 }, petal: { bump: .009, roughness: .8 },
  fabric: { bump: .018, roughness: .9 }, plaster: { bump: .015, roughness: .94 },
  fur: { bump: .009, roughness: .96 },
};

function surfacePixels(kind) {
  if (pixels.has(kind)) return pixels.get(kind);
  const size = 128, color = new Uint8Array(size * size * 4), height = new Uint8Array(size * size * 4), roughness = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, noise = random(x, y), soft = random(Math.floor(x / 5), Math.floor(y / 5));
    let value = .6 + (noise - .5) * .22, shade = .91 + (noise - .5) * .09;
    if (kind === 'wood' || kind === 'bark') {
      const grain = Math.sin(u * Math.PI * 42 + Math.sin(v * Math.PI * 4) * .9 + Math.sin(u * Math.PI * 6) * 2);
      const fine = Math.sin(u * Math.PI * 120 + Math.sin(v * Math.PI * 8) * .65);
      value = .55 + grain * .2 + fine * .06 + (noise - .5) * .09;
      shade = .88 + grain * .065 + fine * .025 + (soft - .5) * .03;
      if (kind === 'bark') { value = .35 + Math.abs(grain) * .45; shade -= Math.pow(Math.max(0, grain), 8) * .17; }
    } else if (kind === 'grass') {
      const fleck = random(Math.floor(x / 2), Math.floor(y / 4));
      value = .45 + noise * .3 + fleck * .15;
      shade = .87 + (noise - .5) * .16 + (fleck - .5) * .12;
    } else if (kind === 'stone') {
      value = .5 + (noise - .5) * .25 + Math.sin(u * 18 + Math.cos(v * 15)) * .1;
      shade = .88 + (noise - .5) * .08 + (soft - .5) * .07 + Math.sin(u * 14 + v * 19) * .025;
    } else if (kind === 'leaf' || kind === 'petal') {
      const vein = Math.pow(Math.max(0, Math.cos((u - .5) * Math.PI * 32 + v * 6)), 12);
      const center = Math.exp(-Math.abs(u - .5) * 90);
      value = .5 + vein * .13 + center * .22 + (noise - .5) * .04;
      shade = .91 + Math.sin(v * Math.PI) * .07 - vein * .035 + (noise - .5) * .025;
    } else if (kind === 'fabric' || kind === 'fur') {
      const weave = Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2);
      value = kind === 'fur' ? .35 + noise * .5 : .5 + weave * .18 + (noise - .5) * .06;
      shade = .94 + (noise - .5) * .06 + (kind === 'fabric' ? weave * .025 : 0);
    }
    const index = (y * size + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      color[index + channel] = Math.round(clamp(shade) * 255);
      height[index + channel] = Math.round(clamp(value) * 255);
      roughness[index + channel] = Math.round(clamp(.9 + (noise - .5) * .12) * 255);
    }
    color[index + 3] = height[index + 3] = roughness[index + 3] = 255;
  }
  const result = { size, color, height, roughness }; pixels.set(kind, result); return result;
}

export function createParkTextures(kind = 'stone') {
  const data = surfacePixels(detail[kind] ? kind : 'stone');
  const texture = (array, colorSpace) => {
    const result = new THREE.DataTexture(array, data.size, data.size, THREE.RGBAFormat);
    result.wrapS = result.wrapT = THREE.RepeatWrapping;
    result.magFilter = THREE.LinearFilter; result.minFilter = THREE.LinearMipmapLinearFilter;
    result.generateMipmaps = true; result.colorSpace = colorSpace; result.anisotropy = 4; result.needsUpdate = true;
    return result;
  };
  return { map: texture(data.color, THREE.SRGBColorSpace), bumpMap: texture(data.height, THREE.NoColorSpace), roughnessMap: texture(data.roughness, THREE.NoColorSpace) };
}

export function createParkMaterial(kind, color, options = {}) {
  const surface = detail[kind] || detail.stone;
  return new THREE.MeshStandardMaterial({ color, ...createParkTextures(kind), roughness: surface.roughness, bumpScale: surface.bump, ...options });
}
