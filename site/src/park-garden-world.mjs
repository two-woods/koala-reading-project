import * as THREE from '../vendor/three/three.module.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { GARDEN_BEDS, GARDEN_PATH_POINTS, getGarden, isGardenBedWet } from './core/park-garden-rules.mjs';
import { createParkMaterial } from './park-materials.mjs';

const gardens=new WeakMap();
const palette={woodLight:0xdbc4a1,stone:0xd8d0b9,stoneShade:0xc4bfa6,moss:0x9eaf78,grass:0x9cb77c,leaf:0x8ea97b,leafLight:0xa8bc89,leafWarm:0xc0c58c,stem:0x718665,cream:0xfff9e9,yellow:0xf3d476,yellowLight:0xffe99f,coral:0xf2aebd,coralLight:0xffcdd6,purple:0xa391bd,purpleLight:0xcabbda,brown:0x8d7151,water:0x9fcfda,can:0x87a8a0};

// 花丛独立持有材料，换种时可以整组释放，不影响草地或其他花丛。
function tools() {
  const materials={};
  const material=(name)=>{
    if(materials[name])return materials[name];
    const kind=/^(leaf|stem)/.test(name)?'leaf':/^(cream|yellow|coral|purple)/.test(name)?'petal':/^stone/.test(name)?'stone':name==='woodLight'?'wood':name==='grass'||name==='moss'?'grass':null;
    const options={roughness:kind==='petal'?.72:.86,side:kind==='leaf'||kind==='petal'?THREE.DoubleSide:THREE.FrontSide};
    if(kind==='petal'||kind==='leaf')options.bumpScale=kind==='petal'?.0015:.003;
    return materials[name]=kind?createParkMaterial(kind,palette[name],options):new THREE.MeshStandardMaterial({color:palette[name],roughness:.86});
  };
  const mesh=(parent,geometry,color,x=0,y=0,z=0)=>{
    const item=new THREE.Mesh(geometry,typeof color==='string'?material(color):color);
    item.position.set(x,y,z);item.castShadow=true;item.receiveShadow=true;parent.add(item);return item;
  };
  const cylinder=(p,rt,rb,h,m,x=0,y=0,z=0,n=12)=>mesh(p,new THREE.CylinderGeometry(rt,rb,h,n),m,x,y,z);
  const ball=(p,x,y,z,sx,sy,sz,m,detail=8)=>{const item=mesh(p,new THREE.SphereGeometry(1,detail,detail-2),m,x,y,z);item.scale.set(sx,sy,sz);return item;};
  const group=(p,name,x=0,y=0,z=0)=>{const item=new THREE.Group();item.name=name;item.position.set(x,y,z);p.add(item);return item;};
  const beam=(p,a,b,r,m='stem')=>{
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),item=cylinder(p,r,r,start.distanceTo(end),m);
    item.position.copy(start).add(end).multiplyScalar(.5);item.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());return item;
  };
  return {material,mesh,cylinder,ball,group,beam};
}

function mergeParts(root) {
  root.updateWorldMatrix(true,true);
  const inverse=new THREE.Matrix4().copy(root.matrixWorld).invert(),buckets=new Map(),old=[];
  root.traverse((item)=>{
    if(!item.isMesh)return;
    const geometry=item.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,item.matrixWorld));
    const plain=geometry.index?geometry.toNonIndexed():geometry;if(plain!==geometry)geometry.dispose();
    // 所有植物薄片都带 UV，合并后保留叶脉和花瓣细纹。
    if(!plain.attributes.uv)plain.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(plain.attributes.position.count*2),2));
    const list=buckets.get(item.material)||[];list.push(plain);buckets.set(item.material,list);old.push(item.geometry);
  });
  root.clear();
  for(const [material,geometries] of buckets){
    const geometry=mergeGeometries(geometries,false);for(const part of geometries)part.dispose();
    if(geometry){const item=new THREE.Mesh(geometry,material);item.castShadow=true;item.receiveShadow=true;root.add(item);}
  }
  for(const geometry of new Set(old))geometry.dispose();
}

function release(root) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse((item)=>{
    if(item.geometry)geometries.add(item.geometry);
    for(const material of [item.material].flat().filter(Boolean)){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}
  });
  for(const geometry of geometries)geometry.dispose();
  for(const texture of textures)texture.dispose();
  for(const material of materials)material.dispose();
}

function surfaceGeometry(rows,columns,point) {
  const positions=[],uvs=[],indices=[];
  for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
    const u=row/rows,v=column/columns;positions.push(...point(u,v*2-1));uvs.push(v,u);
  }
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const a=row*(columns+1)+column,b=a+columns+1;indices.push(a,a+1,b,a+1,b+1,b);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

// 叶片和放射花瓣是有纵向弧度、卷边和中脊的薄曲面，不使用压扁的球体。
function bladeGeometry(length,width,lift=.04,cup=.012,rows=7,columns=4) {
  return surfaceGeometry(rows,columns,(u,v)=>{
    const profile=Math.pow(Math.sin(Math.PI*u),.72);
    return [u*length,lift*Math.sin(u*Math.PI*.8)+cup*(v*v-.2)*profile,width*.5*profile*v];
  });
}

function leaf(p,t,x,y,z,angle=0,scale=1,color='leaf') {
  const root=t.group(p,'garden-leaf',x,y,z),length=.25*scale;
  root.rotation.set(0,x<0?Math.PI:0,Math.abs(angle));
  t.mesh(root,bladeGeometry(length,.115*scale,.035*scale,.022*scale),color);
  for(let i=0;i<3;i++){
    const a=i/3,b=(i+1)/3*.94;
    t.beam(root,[a*length,.035*scale*Math.sin(a*Math.PI*.8)+.003,0],[b*length,.035*scale*Math.sin(b*Math.PI*.8)+.003,0],.0035*scale,'stem');
  }
  return root;
}

function stem(p,t,x,height,z,radius) {
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(-x*.3,height*.4,-z*.3),new THREE.Vector3(x,height,z)]);
  t.mesh(p,new THREE.TubeGeometry(curve,8,radius,6,false),'stem');
}

function daisyBloom(head,t,small=false) {
  const petals=small?10:15;
  for(let i=0;i<petals;i++){
    const a=i*Math.PI*2/petals,petal=t.mesh(head,bladeGeometry(.18+(i%3)*.008,.059,-.018,.012,6,3),'cream',Math.cos(a)*.047,0,Math.sin(a)*.047);
    petal.rotation.y=-a;
  }
  t.ball(head,0,.012,0,.078,.035,.078,'yellow',10);
  for(let i=0;i<(small?7:13);i++){
    const a=i*2.39996,r=.016*Math.sqrt(i);t.ball(head,Math.cos(a)*r,.04-.012*(r/.06),Math.sin(a)*r,.009,.009,.009,'yellow',6);
  }
}

function daisy(p,t) {
  stem(p,t,.025,.57,0,.012);
  leaf(p,t,-.015,.17,0,.55,.75);leaf(p,t,.012,.29,0,.6,.7);
  const head=t.group(p,'daisy-bloom',.025,.58,0);head.rotation.x=.16;head.scale.setScalar(1.2);daisyBloom(head,t);
  for(const [x,y,z] of [[-.14,.36,.065],[.13,.43,-.075]]){
    t.beam(p,[0,.15,0],[x,y,z],.007);
    const bloom=t.group(p,'daisy-side-bloom',x,y,z);bloom.scale.setScalar(.62);bloom.rotation.x=x*1.5;daisyBloom(bloom,t,true);
  }
}

function tulip(p,t) {
  stem(p,t,.025,.67,0,.016);
  const left=leaf(p,t,-.018,.1,0,.95,1.3),right=leaf(p,t,.014,.22,.01,1.1,1.15);
  left.scale.set(1.35,1.25,.95);right.rotation.y=.45;
  const head=t.group(p,'tulip-bloom',.025,.64,0);head.rotation.z=-.08;
  for(let i=0;i<6;i++){
    const inner=i>=3,angle=i*Math.PI*2/3+(inner?Math.PI/3:0),scale=inner?.85:1;
    const geometry=surfaceGeometry(10,6,(u,v)=>{
      const radius=(.028+.129*Math.sin(u*Math.PI*.77))*scale,spread=(.2+.61*Math.pow(Math.sin(Math.PI*u*.92),.6))*v;
      return [radius*Math.cos(spread),u*.31+(inner?.012:0)-.025*v*v*Math.pow(u,3),radius*Math.sin(spread)];
    });
    const petal=t.mesh(head,geometry,i%2?'coralLight':'coral');petal.rotation.y=angle;
  }
  t.ball(head,0,.05,0,.049,.05,.049,'coral');
}

function lavender(p,t) {
  for(let spike=0;spike<3;spike++){
    const x=(spike-1)*.105,z=spike%2*.08-.04,h=.56+spike%2*.17;
    stem(p,t,x,h,z,.008);
    const a=leaf(p,t,x-.012,.12+spike*.035,z,.75,.55),b=leaf(p,t,x+.012,.22+spike*.025,z,.8,.5);a.scale.z=.38;b.scale.z=.38;
    for(let ring=0;ring<7;ring++)for(let i=0;i<3;i++){
      const angle=i*Math.PI*2/3+ring*.75,r=.035*(1-ring*.08),y=h-.15+ring*.045;
      const bloom=t.group(p,'lavender-floret',x+Math.cos(angle)*r,y,z+Math.sin(angle)*r);bloom.rotation.y=-angle;
      t.ball(bloom,0,0,0,.023-ring*.0015,.026,.022,ring%2?'purpleLight':'purple',6);
      const lip=t.mesh(bloom,bladeGeometry(.043-ring*.002,.035,.015,.008,4,2),'purpleLight',.005,.004,0);lip.rotation.z=.3;
    }
  }
}

function sunflower(p,t) {
  stem(p,t,0,.93,0,.021);
  leaf(p,t,-.015,.25,0,.55,1.15);const upper=leaf(p,t,.015,.47,0,.65,1.1);upper.rotation.y=.4;
  const head=t.group(p,'sunflower-bloom',0,.95,0);head.rotation.x=-.24;
  for(let i=0;i<26;i++){
    const angle=i*Math.PI*2/13+(i>=13?.22:0),ray=t.group(head,'sunflower-ray');ray.rotation.z=angle;
    const petal=t.mesh(ray,bladeGeometry(i<13?.19:.16,.074,-.035,.018),'yellowLight',.088,0,i<13?0:.01);
    petal.rotation.x=Math.PI/2;if(i>=13)petal.material=t.material('yellow');
  }
  t.ball(head,0,0,.024,.13,.13,.045,'brown',16);
  for(let i=0;i<42;i++){
    const a=i*2.39996,r=.017*Math.sqrt(i);t.ball(head,Math.cos(a)*r,Math.sin(a)*r,.065-.014*(r/.12),.009,.012,.007,'woodLight',6);
  }
}

function seedFor(bed) {return [...bed.id].reduce((value,char)=>value*31+char.charCodeAt(0),7)%997;}
function noise(seed,index) {const value=Math.sin(seed*12.9898+index*78.233)*43758.5453;return value-Math.floor(value);}

function basalLeaves(p,t,seed) {
  for(let i=0;i<4;i++){
    const angle=i*Math.PI/2+seed*.31,blade=t.mesh(p,bladeGeometry(.28+noise(seed,i)*.035,.17,.09+noise(seed,i+10)*.045,.025,6,3),'leaf',Math.cos(angle)*.012,.025+i%2*.025,Math.sin(angle)*.012);
    blade.rotation.y=-angle;blade.rotation.z=.12+noise(seed,i+20)*.16;
  }
}

function flowerCluster(bed,flowerId) {
  const root=new THREE.Group();root.name=`garden-flowers-${bed.id}`;
  const t=tools(),build={daisy,tulip,lavender,sunflower}[flowerId];
  if(!build)return root;
  const seed=seedFor(bed),count=Math.max(8,Math.min(12,Math.round(bed.width*bed.depth*1.8)));
  for(let i=0;i<count;i++){
    const angle=i*2.39996+seed*.07+noise(seed,i)*.35,radius=Math.sqrt((i+.35)/count)*(.83+noise(seed,i+20)*.13);
    const x=Math.cos(angle)*radius*(bed.width/2-.37),z=Math.sin(angle)*radius*(bed.depth/2-.34);
    const plant=t.group(root,`garden-stem-${bed.id}-${i}`,x,.024,z);
    plant.userData.gardenStem=true;plant.userData.phase=noise(seed,i+40)*1.4+bed.position.z*.08;
    plant.userData.baseScale=.74+noise(seed,i+60)*.35;
    plant.rotation.y=angle;
    basalLeaves(plant,t,seed+i);build(plant,t);mergeParts(plant);plant.scale.setScalar(plant.userData.baseScale);
    for(const item of plant.children)item.castShadow=flowerId==='sunflower'||flowerId==='tulip';
  }
  return root;
}

function soilPatch(bed,t,parent) {
  const seed=seedFor(bed),segments=32,positions=[0,0,0],weights=[1],indices=[];
  for(const [ring,radius] of [.48,.78,1].entries())for(let i=0;i<segments;i++){
    const angle=i/segments*Math.PI*2;
    const ripple=.86+.065*Math.sin(angle*3+seed)+.065*Math.cos(angle*5+seed*.3);
    positions.push(Math.cos(angle)*bed.width/2*radius*ripple,0,Math.sin(angle)*bed.depth/2*radius*ripple);
    weights.push([.85,.3,0][ring]);
  }
  for(let i=0;i<segments;i++){
    const next=(i+1)%segments;indices.push(0,next+1,i+1);
    for(let ring=0;ring<2;ring++){
      const a=1+ring*segments+i,b=1+ring*segments+next,c=a+segments,d=b+segments;
      indices.push(a,b,c,b,d,c);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const colors=new Float32Array(weights.length*4);
  for(let i=0;i<weights.length;i++)colors[i*4+3]=weights[i]*.72;
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const soil=t.mesh(parent,geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,transparent:true,depthWrite:false}),0,.014,0);
  soil.name=`garden-soil-${bed.id}`;soil.castShadow=false;soil.userData.soilWeights=weights;
  return soil;
}

function grassTuft(p,t,x,z,seed,scale=1) {
  const grassy=noise(seed,4)>.68,count=grassy?7:6;
  for(let i=0;i<count;i++){
    const angle=i*2.39996+seed,h=(.1+noise(seed,i)*.13)*scale,color=['leaf','leafLight','leafWarm'][(i+Math.floor(seed))%3];
    const geometry=grassy?surfaceGeometry(5,2,(u,v)=>[
      .075*scale*u*u,
      h*u-.022*scale*u*u,
      .014*scale*Math.pow(Math.sin(Math.PI*u),.6)*v,
    ]):bladeGeometry(.185*scale,.112*scale,(.055+noise(seed,i+5)*.065)*scale,.02*scale,5,2);
    const blade=t.mesh(p,geometry,color,x+Math.cos(angle)*.022*scale,.012+(grassy?0:i%2*.027*scale),z+Math.sin(angle)*.022*scale);
    blade.rotation.y=-angle;blade.rotation.z=grassy?noise(seed,i+10)*.22:.15;
  }
}

function meadowWildflower(p,t,x,z,seed) {
  const h=.15+noise(seed,2)*.08;
  t.beam(p,[x,.02,z],[x+.015,h,z],.008,'stem');
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5,petal=t.mesh(p,bladeGeometry(.05,.032,.005,.006,4,2),'cream',x+.015+Math.cos(a)*.01,h,z+Math.sin(a)*.01);petal.rotation.y=-a;
  }
  t.ball(p,x+.015,h+.012,z,.02,.014,.02,'yellow',6);
}

function meadowEdge(p,t,bed) {
  const root=t.group(p,'garden-meadow-edge'),seed=seedFor(bed);
  for(let i=0;i<25;i++){
    const angle=i*2.39996+seed,r=Math.sqrt(noise(seed,i))*.98;
    const x=Math.cos(angle)*r*(bed.width/2-.23),z=Math.sin(angle)*r*(bed.depth/2-.23);
    grassTuft(root,t,x,z,seed+i,.68+noise(seed,i+20)*.48);
    if(i%5===0)meadowWildflower(root,t,x,z,seed+i+51);
  }
  // 石头只是散落的自然点景，不围出种植边界。
  const side=bed.position.x<0?-1:1;
  const rock=t.ball(root,side*(bed.width/2-.2),.065,Math.sin(seed)*bed.depth*.21,.17,.095,.12,'stoneShade');rock.rotation.y=seed;
  mergeParts(root);for(const item of root.children)item.castShadow=false;
}

function steppingPath(p,t) {
  const path=t.group(p,'garden-stepping-path'),end=GARDEN_PATH_POINTS.at(-1);
  const points=[{x:0,z:0},...GARDEN_PATH_POINTS,{x:end.x,z:end.z-.5}].map(point=>new THREE.Vector3(point.x,.04,point.z));
  const curve=new THREE.CurvePath();
  for(let i=1;i<points.length;i++)curve.add(new THREE.LineCurve3(points[i-1],points[i]));
  const count=Math.ceil(curve.getLength()/.62);
  for(let i=0;i<=count;i++){
    const amount=i/count,position=curve.getPoint(amount),tangent=curve.getTangent(Math.min(.99999,amount));
    const stagger=Math.sin(i*2.4)*.075;
    const stone=t.cylinder(path,.36+(i%3)*.035,.39+(i%3)*.035,.06,i%4?'stone':'stoneShade',position.x+tangent.z*stagger,.037,position.z-tangent.x*stagger,7);
    stone.scale.set(1.23,.55,.85);stone.rotation.y=i*1.71;
  }
  mergeParts(path);
  path.userData.centerline=GARDEN_PATH_POINTS.map(point=>({...point}));
}

function gardenMargins(p,t) {
  const margins=t.group(p,'garden-meadow-margins');
  // 两条疏密变化的低花境贯穿南北，连接各片主花丛；中央步道持续留白。
  for(const side of [-1,1])for(let i=0;i<90;i++){
    const seed=i+211+(side+1)*113,z=-2.05-(i+noise(seed,1)*.65)/90*7.8;
    const width=1.45+Math.sin(z*1.8)*.3,x=side*(1.72+noise(seed,2)*width);
    grassTuft(margins,t,x,z,seed,.78+noise(seed,3)*.48);
  }
  for(const side of [-1,1])for(let i=0;i<15;i++){
    const seed=i+733+(side+1)*71,z=-2.15-(i+noise(seed,1)*.6)/15*7.7;
    const x=side*(1.72+noise(seed,2)*1.4);
    meadowWildflower(margins,t,x,z,seed);
  }
  mergeParts(margins);for(const item of margins.children)item.castShadow=false;
}

function waterEffect(p,t) {
  const root=t.group(p,'garden-watering'),can=t.group(root,'garden-water-can');root.visible=false;
  t.cylinder(can,.17,.2,.3,'can',0,.025,0,20);
  const rim=t.mesh(can,new THREE.TorusGeometry(.17,.022,7,20),'cream',0,.18,0);rim.rotation.x=Math.PI/2;
  const handle=t.mesh(can,new THREE.TorusGeometry(.145,.03,7,18),'can',-.19,.035,0);handle.scale.x=.8;
  t.beam(can,[.12,.045,0],[.44,.22,0],.04,'can');
  const rose=t.cylinder(can,.075,.06,.055,'cream',.46,.23,0);rose.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(1,.5,0).normalize());
  t.ball(can,0,.025,.195,.065,.065,.012,'cream');t.ball(can,0,.025,.209,.025,.025,.008,'yellow');
  const drops=t.group(root,'garden-water-drops'),geometry=new THREE.SphereGeometry(1,7,5),material=t.material('water');
  material.roughness=.3;material.transparent=true;material.opacity=.8;
  for(let i=0;i<18;i++){const drop=t.mesh(drops,geometry,material);drop.scale.set(.018,.035,.018);drop.castShadow=false;drop.userData.phase=i/18;}
  return {root,can,drops,start:null,bedId:null};
}

export function buildGardenWorld(game=null,now=Date.now()) {
  const root=new THREE.Group();root.name='garden-world';
  const t=tools(),land=t.group(root,'garden-landscape');
  steppingPath(land,t);gardenMargins(land,t);
  const beds=new Map();
  for(const bed of GARDEN_BEDS){
    const group=t.group(root,`garden-bed-${bed.id}`,bed.position.x,0,bed.position.z);group.userData.gardenBedId=bed.id;
    const soil=soilPatch(bed,t,group);meadowEdge(group,t,bed);
    beds.set(bed.id,{bed,root:group,soil,flowers:null,record:null,wet:null});
  }
  const watering=waterEffect(root,t);gardens.set(root,{beds,watering});
  updateGardenWorld(root,game,now);return root;
}

function updateSoil(entry,now) {
  const wet=Boolean(entry.record&&isGardenBedWet(entry.record,now));
  if(wet!==entry.wet){
    const colors=entry.soil.geometry.attributes.color,grass=new THREE.Color(palette.grass),soil=new THREE.Color(wet?0x74674d:0xb0aa82),color=new THREE.Color();
    for(const [i,weight] of entry.soil.userData.soilWeights.entries()){
      color.copy(grass).lerp(soil,weight);colors.setXYZ(i,color.r,color.g,color.b);
    }
    colors.needsUpdate=true;entry.wet=wet;entry.root.userData.wet=wet;
  }
}

export function updateGardenWorld(root,game,now=Date.now()) {
  const state=gardens.get(root);if(!state)return;
  const records=getGarden(game||{}).beds;
  for(const entry of state.beds.values()){
    const record=records.find((item)=>item.id===entry.bed.id)||null;
    if((record?.flowerId||null)!==(entry.record?.flowerId||null)){
      if(entry.flowers){release(entry.flowers);entry.root.remove(entry.flowers);entry.flowers=null;}
      if(record){entry.flowers=flowerCluster(entry.bed,record.flowerId);entry.root.add(entry.flowers);}
      if(state.watering.bedId===entry.bed.id)cancelGardenWater(root);
    }
    entry.record=record?{...record}:null;entry.root.userData.flowerId=record?.flowerId||null;
    updateSoil(entry,Number.isFinite(now)?now:Date.now());
  }
}

export function playGardenWater(root,bedId,elapsed) {
  const state=gardens.get(root),entry=state?.beds.get(bedId);
  if(!entry?.record||!Number.isFinite(elapsed))return false;
  cancelGardenWater(root);
  const water=state.watering,dx=entry.bed.position.x-entry.bed.approach.x,dz=entry.bed.position.z-entry.bed.approach.z,distance=Math.hypot(dx,dz)||1;
  water.root.position.set(entry.bed.approach.x+dx/distance*.64,.85,entry.bed.approach.z+dz/distance*.64);
  water.root.rotation.y=Math.atan2(-dz,dx);water.can.rotation.z=0;water.reach=Math.max(.4,distance-1.12);
  water.start=elapsed;water.bedId=bedId;water.root.visible=true;water.drops.visible=false;return true;
}

export function cancelGardenWater(root) {
  const state=gardens.get(root);if(!state)return;
  const water=state.watering;water.root.visible=false;water.drops.visible=false;water.start=null;water.bedId=null;
  for(const entry of state.beds.values())for(const plant of entry.flowers?.children||[])plant.scale.setScalar(plant.userData.baseScale);
}

export function animateGardenWorld(root,elapsed,now=Date.now(),reducedMotion=false) {
  const state=gardens.get(root);if(!state||!Number.isFinite(elapsed))return;
  const water=state.watering,age=water.start===null?-1:elapsed-water.start;
  if(age>=2||age<0&&water.start!==null)cancelGardenWater(root);
  const pouring=water.start!==null,amount=pouring?Math.sin(Math.min(1,age/2)*Math.PI):0;
  for(const entry of state.beds.values()){
    updateSoil(entry,Number.isFinite(now)?now:Date.now());
    for(const plant of entry.flowers?.children||[]){
      const phase=plant.userData.phase,motion=reducedMotion?.08:1;
      plant.rotation.z=(Math.sin(elapsed*1.15)*.042+Math.sin(elapsed*.83+phase)*.018)*motion;
      plant.rotation.x=Math.cos(elapsed*.83+phase)*.03*motion;
      const lift=water.bedId===entry.bed.id&&!reducedMotion?amount*.065:0;
      plant.scale.setScalar(plant.userData.baseScale);plant.scale.y*=1+lift;
    }
  }
  if(!pouring)return;
  const angle=-amount*.55;water.can.rotation.z=angle;water.drops.visible=age>.13&&age<1.86;
  const startX=.46*Math.cos(angle)-.23*Math.sin(angle),startY=.46*Math.sin(angle)+.23*Math.cos(angle);
  for(let i=0;i<water.drops.children.length;i++){
    const drop=water.drops.children[i],u=(age*1.6+drop.userData.phase)%1;
    drop.position.set(startX+u*water.reach,startY-u*(.82+startY),Math.sin(i*2.39996)*.12*u);
  }
}
