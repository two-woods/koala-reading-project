import * as THREE from '../vendor/three/three.module.js';

export function createParkLighting() {
  const group=new THREE.Group();group.name='park-lighting';
  const sun=new THREE.DirectionalLight(0xffefd7,3);sun.name='park-sun';
  sun.position.set(-25,42,20);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-39,right:39,top:36,bottom:-36,near:1,far:120});
  sun.shadow.radius=3;sun.shadow.normalBias=.06;sun.shadow.bias=-.0001;
  sun.shadow.camera.updateProjectionMatrix();
  const ambient=new THREE.HemisphereLight(0xeaf1ff,0x849474,1.45);ambient.name='park-ambient';
  group.add(sun,sun.target,ambient);return group;
}

export function createContactShadow(width,depth,opacity=.25) {
  if(!Number.isFinite(width)||!Number.isFinite(depth)||width<=0||depth<=0)throw new RangeError('接触阴影的宽和深必须是正数。');
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=x/(size-1)*2-1,dy=y/(size-1)*2-1,radiusSquared=dx*dx+dy*dy,index=(y*size+x)*4;
    data[index]=65;data[index+1]=77;data[index+2]=58;
    // 圆形边缘的值与斜率同时归零，近景不会露出方形贴片。
    data[index+3]=Math.round(255*Math.max(0,1-radiusSquared)**3);
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.name='park-contact-shadow';texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:Number.isFinite(opacity)?THREE.MathUtils.clamp(opacity,0,1):.25,depthWrite:false,toneMapped:false});
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),material);
  shadow.name='park-contact-shadow';shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;
  return shadow;
}
