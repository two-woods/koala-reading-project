import * as THREE from '../vendor/three/three.module.js';
import { RoundedBoxGeometry } from '../vendor/three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { PARK_SIZE, TREE_POSITIONS } from './core/park-navigation.mjs';
import { createParkMaterial } from './park-materials.mjs';

const colors = { grass:0xa6b985, edge:0x839c67, earth:0xbca082, wood:0xc29766, darkWood:0x896443, lightWood:0xdcbc89, cream:0xf6edda, sage:0x8f9f79, leaf:0x8ba275, leafLight:0xa9b981, leafDark:0x6c875f, stone:0xd8cfb7, pot:0xc99172, yellow:0xe9ce7c, pink:0xe3b6b5, book:0x8b9caa, water:0x9cc7c6, bark:0xb9966b, fabric:0x94a583, canvas:0xf6efdb, wall:0xeee4cf, copper:0x98734b, windowGlow:0xffdf9f, soil:0x796343, flowerLeaf:0x7f9a60, purple:0xa39ac3 };
const surfaces = { grass:'grass',edge:'grass',earth:'stone',wood:'wood',darkWood:'wood',lightWood:'wood',cream:'fabric',sage:'leaf',leaf:'leaf',leafLight:'leaf',leafDark:'leaf',stone:'stone',pot:'plaster',yellow:'petal',pink:'petal',book:'fabric',water:'stone',bark:'bark',fabric:'fabric',canvas:'fabric',wall:'plaster',copper:'stone',windowGlow:'plaster',soil:'stone',flowerLeaf:'leaf',purple:'petal' };
// 模板不交给场景释放；每次构造返回独立的材质和纹理实例。
export const materials = Object.fromEntries(Object.entries(colors).map(([name,color]) => [name,createParkMaterial(surfaces[name],color)]));
materials.water.roughness=.25;
materials.copper.metalness=.48;materials.copper.roughness=.43;
materials.windowGlow.emissive.setHex(0xffcc79);materials.windowGlow.emissiveIntensity=.32;
materials.fabric.side=materials.canvas.side=THREE.DoubleSide;
materials.meadow=createParkMaterial('grass',0xffffff,{vertexColors:true,side:THREE.DoubleSide,bumpScale:.007});
for(const key of ['map','bumpMap','roughnessMap'])materials.grass[key].repeat.set(28,24);

function ownResources(root) {
  const palette=new Map(),textures=new Map();
  root.traverse(item=>{
    if(!item.isMesh)return;
    const own=(source)=>{
      if(palette.has(source))return palette.get(source);
      const copy=source.clone();
      for(const key of Object.keys(copy))if(copy[key]?.isTexture){
        if(!textures.has(copy[key])){const texture=copy[key].clone();texture.needsUpdate=true;textures.set(copy[key],texture);}
        copy[key]=textures.get(copy[key]);
      }
      palette.set(source,copy);return copy;
    };
    item.material=Array.isArray(item.material)?item.material.map(own):own(item.material);
  });
  return root;
}

function mesh(parent,geometry,material,x=0,y=0,z=0) {
  const item=new THREE.Mesh(geometry,typeof material==='string'?materials[material]:material);
  item.position.set(x,y,z); item.castShadow=true; item.receiveShadow=true; parent.add(item); return item;
}
function box(p,w,h,d,m,x=0,y=0,z=0,r=.09) { return mesh(p,new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)),m,x,y,z); }
function cylinder(p,rt,rb,h,m,x=0,y=0,z=0,n=16) {return mesh(p,new THREE.CylinderGeometry(rt,rb,h,n),m,x,y,z);}
function ball(p,x,y,z,sx,sy,sz,m) { const item=mesh(p,new THREE.SphereGeometry(1,12,8),m,x,y,z); item.scale.set(sx,sy,sz); return item; }
function beam(p,a,b,r,m='wood') { const start=new THREE.Vector3(...a), end=new THREE.Vector3(...b); const item=cylinder(p,r,r,start.distanceTo(end),m); item.position.copy(start).add(end).multiplyScalar(.5); item.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize()); return item; }
function group(p,x=0,z=0) { const g=new THREE.Group();g.position.set(x,0,z);p.add(g);return g; }

function leaflet(p,x,y,z,sx,sy,sz,m='leaf') {
  const leaf=mesh(p,new THREE.SphereGeometry(1,8,6),m,x,y,z);leaf.scale.set(sx,sy,sz);return leaf;
}

function blossom(p,x,y,z,scale=1,color='cream') {
  const g=group(p,x,z);g.position.y=y;g.scale.setScalar(scale);
  for(let i=0;i<7;i++){
    const a=i*Math.PI*2/7;
    const petal=leaflet(g,Math.sin(a)*.085,.015,Math.cos(a)*.085,.04,.023,.085,color);petal.rotation.y=a;
  }
  leaflet(g,0,.037,0,.048,.028,.048,'yellow');
  return g;
}

function vine(p,points,seed=0) {
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1];beam(p,a,b,.017,'flowerLeaf');
    for(let j=0;j<3;j++){
      const t=(j+.3)/3,side=(i+j)%2?-1:1;
      const x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,z=a[2]+(b[2]-a[2])*t;
      const leaf=leaflet(p,x+side*.085,y,z+.035,.115,.19,.035,(i+j+seed)%3?'leaf':'leafLight');
      leaf.rotation.z=side*.65;leaf.rotation.y=Math.sin(i+seed)*.35;
      if((i+j+seed)%7===0)blossom(p,x,y+.08,z+.09,.53,'cream').rotation.x=.65;
    }
  }
}

function lantern(p,x,y,z) {
  const g=group(p,x,z);g.position.y=y;
  box(g,.13,.36,.1,'copper',0,.21,-.18,.02);
  beam(g,[0,.39,-.15],[0,.39,.12],.025,'copper');
  const loop=mesh(g,new THREE.TorusGeometry(.07,.018,6,12),'copper',0,.3,.12);
  box(g,.2,.32,.2,'windowGlow',0,.04,.12,.025);
  for(const dx of [-.13,.13])for(const dz of [-.01,.25])box(g,.025,.36,.025,'copper',dx,.04,dz,.008);
  cylinder(g,.19,.12,.12,'copper',0,.26,.12,4).rotation.y=Math.PI/4;
  box(g,.31,.045,.31,'copper',0,-.16,.12,.02);
  loop.castShadow=false;
}

function flowerpot(p,x,z,scale=1) {
  const g=group(p,x,z);g.scale.setScalar(scale);
  cylinder(g,.31,.22,.48,'pot',0,.24,0);cylinder(g,.34,.34,.1,'pot',0,.46,0);
  cylinder(g,.29,.29,.025,'soil',0,.51,0);
  for(let i=0;i<5;i++){
    const a=i*2.4,x=Math.cos(a)*.24,z=Math.sin(a)*.21,y=.93+i%2*.13;
    beam(g,[0,.5,0],[x,y,z],.015,'flowerLeaf');
    const leaf=leaflet(g,x*.7,.68,z*.7,.19,.045,.08,'flowerLeaf');leaf.rotation.y=-a;leaf.rotation.z=.35;
    blossom(g,x,y,z,.85,i%3?'cream':'yellow').rotation.x=.18;
  }
}
function table(p,x,z,scale=1) {const g=group(p,x,z);g.scale.setScalar(scale);const top=cylinder(g,.7,.7,.16,'lightWood',0,.65,0,32);top.scale.z=.8;for(const dx of [-.42,.42])for(const dz of [-.32,.32])box(g,.13,.55,.13,'wood',dx,.29,dz);cylinder(g,.14,.17,.2,'cream',0,.85,0);ball(g,0,.99,0,.13,.04,.13,'cream');}
function sofa(p,x,z) {const g=group(p,x,z);box(g,2.5,.42,1,'wood',0,.36,0);box(g,2.4,.6,.25,'cream',0,.9,-.45);for(const dx of [-1.12,1.12])box(g,.28,.65,1.1,'cream',dx,.73,0);for(const dx of [-.5,.5]){box(g,.92,.24,.9,'cream',dx,.69,.05);box(g,.55,.48,.19,'sage',dx,.95,-.26);}for(const dx of [-.9,.9])for(const dz of [-.35,.35])box(g,.15,.24,.15,'wood',dx,.12,dz);}
function bed(p,x,z) {const g=group(p,x,z);box(g,1.7,.4,2.8,'wood',0,.32,0);box(g,1.64,.27,2.65,'cream',0,.65,0);box(g,1.7,.75,.18,'lightWood',0,.7,-1.34);box(g,1.6,.18,1.75,'sage',0,.83,.4);box(g,1.1,.21,.55,'cream',0,.9,-.85);}
function shelf(p,x,z) {const g=group(p,x,z);for(const dx of [-1.05,1.05])box(g,.16,2.2,.45,'wood',dx,1.22,0);for(const y of [.25,.9,1.55,2.2])box(g,2.2,.14,.5,'lightWood',0,y,0);for(let row=0;row<3;row++)for(let i=0;i<8;i++){const h=.35+(i%3)*.055;box(g,.12,h,.26,['sage','cream','book','pink'][i%4],-.84+i*.22,.35+row*.65+h/2,0,.02);}}
function cabin(p) {
  const g=group(p,-8.7,-5.8);box(g,7.5,.35,6,'darkWood',0,.17,0);
  for(let i=0;i<15;i++)box(g,.47,.12,5.8,i%3?'wood':'lightWood',-3.43+i*.49,.39,0,.015);
  box(g,7.2,2.8,.18,'wall',0,1.8,-2.85);box(g,.18,2.15,5.7,'wall',-3.5,1.5,0);box(g,.18,.8,5.7,'wall',3.5,.85,0);
  for(const y of [.55,2.95])box(g,7.3,.16,.15,'wood',0,y,-2.72,.025);
  for(const x of [-3.45,.6,3.45])box(g,.13,2.7,.15,'wood',x,1.8,-2.72,.025);
  box(g,.15,.16,5.7,'lightWood',-3.36,2.54,0,.025);box(g,.19,.15,5.75,'wood',3.5,1.3,0,.025);
  for(const x of [-3.6,3.6])for(const z of [-2.9,2.9])box(g,.24,3.2,.24,'wood',x,1.9,z);
  for(const x of [-3.6,3.6])for(const z of [-2.9,2.9]){
    box(g,.31,.15,.31,'darkWood',x,.51,z,.025);box(g,.31,.12,.31,'lightWood',x,3.37,z,.025);
    beam(g,[x,2.85,z],[x-Math.sign(x)*.58,3.4,z],.055,'lightWood');
  }
  beam(g,[-3.7,3.45,-2.9],[0,5,-2.9],.15,'darkWood');beam(g,[0,5,-2.9],[3.7,3.45,-2.9],.15,'darkWood');
  beam(g,[-3.7,3.45,2.9],[0,5,2.9],.13);beam(g,[0,5,2.9],[3.7,3.45,2.9],.13);
  beam(g,[0,5,-3],[0,5,3],.16);beam(g,[-3.7,3.45,-3],[-3.7,3.45,3],.14);beam(g,[3.7,3.45,-3],[3.7,3.45,3],.14);
  // 仅保留屋顶后半部，前方剖开，能够看清室内家具。
  for(let side of [-1,1])for(let row=0;row<5;row++)for(let col=0;col<3;col++){
    const tile=box(g,.83,.15,.67,'sage',side*(.37+row*.78),4.92-row*.325,-2.9+col*.62);tile.rotation.z=side*-.4;
  }
  const window=group(g,2,-2.68);box(window,1.9,1.65,.12,'darkWood',0,2,0,.04);
  box(window,1.72,1.49,.13,'lightWood',0,2,.08,.035);box(window,1.43,1.21,.1,'windowGlow',0,2,.16,.015);
  for(const dx of [-.75,.75])box(window,.095,1.4,.16,'wood',dx,2,.23,.02);
  for(const y of [1.34,2.66])box(window,1.65,.095,.16,'wood',0,y,.23,.02);
  box(window,.065,1.23,.16,'canvas',0,2,.24,.015);box(window,1.46,.065,.16,'canvas',0,2,.24,.015);
  box(window,2.06,.14,.45,'lightWood',0,1.2,.16,.035);
  for(const dx of [-1.01,1.01]){
    box(window,.22,1.4,.12,'sage',dx,2,.05,.025);
    for(let i=0;i<7;i++)box(window,.22,.065,.1,'leafLight',dx,1.48+i*.17,.13,.01);
  }
  const windowFlowers=group(window);windowFlowers.position.y=1.29;
  flowerpot(windowFlowers,-.65,.17,.46);flowerpot(windowFlowers,.65,.17,.5);
  const door=group(g,-2.7,-2.7);box(door,1.13,2.05,.1,'darkWood',0,1.5,0,.035);
  for(let i=0;i<5;i++)box(door,.19,1.9,.08,i%2?'wood':'lightWood',-.4+i*.2,1.5,.08,.015);
  for(const y of [.8,2.15])box(door,1.02,.09,.11,'wood',0,y,.14,.015);
  leaflet(door,.34,1.44,.23,.055,.055,.055,'copper');
  lantern(g,3.6,2.65,2.96);lantern(g,.76,2.28,-2.48);
  const furnishings=group(g);furnishings.position.y=.46;
  sofa(furnishings,-1.8,.5);table(furnishings,-1.7,1.8,.85);bed(furnishings,1.8,.75);shelf(furnishings,-1,-2.45);
  box(g,3.4,.2,.7,'lightWood',-.9,.23,3.3);box(g,3.8,.15,.7,'wood',-.9,.08,3.9);
  flowerpot(g,-3.3,3.2,1.1);flowerpot(g,3,3.25,1.2);
  vine(g,[[3.62,.5,2.83],[3.47,1.2,2.88],[3.65,1.9,2.85],[3.48,2.65,2.86],[3.59,3.4,2.87],[2.8,3.77,2.86],[2.15,4.03,2.85]],1);
  vine(g,[[-3.61,.5,-1.1],[-3.59,1.3,-.8],[-3.62,2.1,-1],[-3.58,2.8,-.8],[-3.6,3.42,-1],[-3.6,3.42,-1.8],[-3.6,3.42,-2.5]],3);
  vine(g,[[2.93,1.15,-2.43],[3.07,1.8,-2.43],[2.96,2.48,-2.43],[3.1,3.12,-2.43],[2.3,3.17,-2.43]],2);
}

function awning(p,x,material) {
  const positions=[],normals=[],uvs=[],indices=[],columns=4,rows=16;
  for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
    const u=col/columns,v=row/rows,z=-2.15+v*4.3;
    positions.push(x+(u-.5)*.6,3.55-z*.1-Math.sin(v*Math.PI)*.16-Math.sin(u*Math.PI)*.025,z);
    normals.push(0,1,0);uvs.push(u,v);
    if(row<rows&&col<columns){const a=row*(columns+1)+col,b=a+columns+1;indices.push(a,b,a+1,b,b+1,a+1);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();mesh(p,geometry,material);
  const scallop=new THREE.Shape();scallop.moveTo(-.3,0);scallop.lineTo(.3,0);scallop.lineTo(.3,-.2);scallop.quadraticCurveTo(.29,-.37,0,-.37);scallop.quadraticCurveTo(-.29,-.37,-.3,-.2);scallop.closePath();
  mesh(p,new THREE.ExtrudeGeometry(scallop,{depth:.035,bevelEnabled:true,bevelThickness:.008,bevelSize:.008,bevelSegments:1,curveSegments:6}),material,x,3.335,2.15);
}

function shop(p) {
  const g=group(p,8.8,-6);box(g,5.8,.35,4,'wood',0,.17,0);
  for(let i=0;i<12;i++)box(g,.46,.08,3.95,i%3?'wood':'lightWood',-2.63+i*.48,.39,0,.015);
  for(const x of [-2.65,2.65])for(const z of [-1.8,1.8])cylinder(g,.1,.12,3,'darkWood',x,1.7,z);
  for(let i=0;i<10;i++) {
    const x=-2.7+i*.6;
    awning(g,x,i%2?'canvas':'fabric');
  }
  for(const z of [-2.12,2.12])beam(g,[-3.02,3.55-z*.1,z],[3.02,3.55-z*.1,z],.055,'lightWood');
  box(g,5.1,1,.65,'lightWood',0,.9,1.25);box(g,5.4,.16,.9,'wood',0,1.48,1.25);
  for(let i=0;i<11;i++)box(g,.42,.85,.06,i%3?'wood':'lightWood',-2.3+i*.46,.94,1.61,.015);
  for(const y of [.51,1.36])box(g,5.12,.1,.08,'darkWood',0,y,1.64,.02);
  sofa(g,-1.3,-.5);shelf(g,1.45,-1.35);flowerpot(g,-3.2,1.3);flowerpot(g,3.3,1.3);
  box(g,2.36,.73,.14,'darkWood',0,2.63,1.95,.05);box(g,2.2,.58,.12,'canvas',0,2.63,2.04,.04);
  for(const x of [-.87,.87])beam(g,[x,3.28,1.95],[x,2.94,1.95],.018,'copper');
  // 招牌叶片为立体造型，文字入口由界面提供。
  for(let i=0;i<3;i++){const leaf=leaflet(g,-.4+i*.4,2.65,2.13,.12,.2,.025,'flowerLeaf');leaf.rotation.z=-.4+i*.4;}
  const display=group(g);display.position.y=1.58;
  for(const x of [-1.95,-1.45])flowerpot(display,x,1.2,.36);
  for(const x of [.65,1.15,1.65]){
    cylinder(display,.16,.13,.23,'canvas',x,.13,1.3,18);cylinder(display,.13,.13,.02,'soil',x,.255,1.3,18);
    const handle=mesh(display,new THREE.TorusGeometry(.075,.025,6,12),'canvas',x+.16,.16,1.3);handle.rotation.y=Math.PI/2;
  }
  box(display,.6,.06,.4,'sage',-.48,.04,1.22,.02);box(display,.55,.035,.36,'canvas',-.48,.085,1.22,.012);
  box(display,.53,.055,.39,'pink',-.4,.13,1.2,.02);
  lantern(g,2.65,2.75,1.86);
  vine(g,[[2.71,.48,-1.76],[2.68,1.2,-1.77],[2.72,1.95,-1.77],[2.63,2.7,-1.77],[2.67,3.64,-1.77],[1.9,3.68,-1.78],[1.2,3.68,-1.78]],4);
}
function swing(p,x=0,z=0,scale=1) {
  const g=group(p,x,z);g.scale.setScalar(scale);
  for(const side of [-1.5,1.5]){beam(g,[side,0,-1],[side,2.9,0],.13);beam(g,[side,0,1],[side,2.9,0],.13);beam(g,[side,.9,-.65],[side,.9,.65],.09);}
  beam(g,[-1.75,2.9,0],[1.75,2.9,0],.15);for(const x of [-.65,.65])beam(g,[x,2.8,0],[x,.65,.1],.025,'cream');box(g,1.6,.15,.6,'wood',0,.6,.1);
}
function bench(p,x,z) {const g=group(p,x,z);for(const dx of [-1.2,1.2])for(const dz of [-.4,.4])box(g,.16,.65,.16,'darkWood',dx,.32,dz);for(let i=0;i<4;i++)box(g,3.2,.12,.22,'wood',0,.72,-.35+i*.24);for(let i=0;i<3;i++)box(g,3.2,.2,.12,'lightWood',0,1+i*.25,-.5);for(const dx of [-1.3,1.3])box(g,.12,1.4,.12,'darkWood',dx,.85,-.5);}
function fountain(p) {const g=group(p,11.2,6);cylinder(g,1.7,1.8,.3,'stone',0,.15,0,32);const rim=mesh(g,new THREE.TorusGeometry(1.48,.18,8,40),'stone',0,.48,0);rim.rotation.x=Math.PI/2;cylinder(g,1.44,1.44,.12,'water',0,.34,0,40);cylinder(g,.24,.38,1.3,'stone',0,.9,0);cylinder(g,.7,.38,.18,'stone',0,1.55,0);ball(g,0,1.8,0,.14,.35,.14,'water');for(let i=0;i<6;i++){let a=i*Math.PI/3;beam(g,[Math.cos(a)*.55,1.5,Math.sin(a)*.55],[Math.cos(a)*.9,.5,Math.sin(a)*.9],.025,'water');}}
function tree(p,x,z,i) {
  const g=group(p,x,z);g.rotation.y=i*1.7;const s=.85+(i%4)*.13;g.scale.setScalar(s);
  cylinder(g,.16,.29,2.8,'bark',.03,1.4,0,12);
  beam(g,[.03,1.5,0],[-.8,3.3,.15],.12,'bark');beam(g,[.05,2,0],[.8,3.65,-.1],.11,'bark');
  for(let j=0;j<5;j++){
    const a=j*2.4;beam(g,[.03,.28,0],[Math.cos(a)*.46,.035,Math.sin(a)*.46],.065,'bark');
    beam(g,[.03,2.5,0],[Math.cos(a)*1.18,3.5+(j%2)*.5,Math.sin(a)*1.1],.065,'bark');
  }
  // 叶簇从下层枝梢到冠顶逐级收拢，保留圆润轮廓和叶间阴影。
  for(let layer=0;layer<3;layer++){
    const count=[19,15,9][layer],radius=[1.42,1.17,.73][layer];
    for(let j=0;j<count;j++){
      const angle=j*2.39996+layer*.65,r=radius*Math.sqrt((j+.5)/count);
      const y=3.25+layer*.69+Math.sin(j*3.1+i)*.14;
      const size=.47+(j%4)*.055;
      const crown=ball(g,Math.cos(angle)*r,y,Math.sin(angle)*r,size,size*(1.08+(j%3)*.09),size*.87,['leaf','leafLight','leaf','leafDark'][(j+layer+i)%4]);
      crown.rotation.y=angle;crown.rotation.z=Math.sin(j*2.3)*.22;
    }
  }
  for(let j=0;j<7;j++){
    const a=j*2.4;leaflet(g,Math.cos(a)*.38,.14,Math.sin(a)*.38,.27,.17,.22,j%2?'leafLight':'leafDark');
  }
}
function path(p,a,b,count=12) {for(let i=0;i<count;i++){const t=i/(count-1),x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;const stone=cylinder(p,.36+(i%3)*.035,.4,.09,'stone',x,.05,z,7);stone.rotation.y=i*1.3;stone.scale.x=1.3;}}
function fence(p,x,z,angle=0) {const g=group(p,x,z);g.rotation.y=angle;for(const x of [-1.5,0,1.5]){cylinder(g,.1,.11,.9,'wood',x,.45,0);ball(g,x,.92,0,.12,.12,.12,'wood');}for(const y of [.35,.7])box(g,3.2,.1,.09,'lightWood',0,y,0);}

function arcade(p) {
  const g=group(p,-20,9.3);
  box(g,3.2,.15,2.1,'lightWood',0,.08,0);
  for(const x of [-1.35,1.35])box(g,.17,2.5,.17,'wood',x,1.3,-.65);
  box(g,3.2,.45,.24,'cream',0,2.45,-.65);
  box(g,2.9,1,.85,'wood',0,.64,0);box(g,3.1,.13,1,'lightWood',0,1.18,0);
  for(let i=0;i<5;i++){const tile=box(g,.4,.16,.55,['sage','pink','yellow','book','cream'][i],-1+i*.5,1.35,.02);tile.rotation.x=.15;}
  for(const x of [-.8,0,.8])ball(g,x,2.47,-.48,.18,.18,.05,'yellow');
  // 低矮的平台可以行走，柜台进入寻路障碍；保持主持人前方留白。
  const plaza=cylinder(p,3.6,3.6,.08,'stone',-18.7,.015,10.8,40);plaza.scale.z=.85;
  for(const [x,z] of [[-21.5,12.5],[-15.5,12.6]])flowerpot(p,x,z,1.2);
}

function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets=new Map(), old=[];
  root.traverse(item=>{if(!item.isMesh)return;const geometry=item.geometry.clone().applyMatrix4(item.matrixWorld);const plain=geometry.index?geometry.toNonIndexed():geometry;if(plain!==geometry)geometry.dispose();const list=buckets.get(item.material)||[];list.push(plain);buckets.set(item.material,list);old.push(item);});
  const result=new THREE.Group();
  for(const [material,geometries] of buckets){const combined=mergeGeometries(geometries,false);for(const geometry of geometries)geometry.dispose();if(combined){const item=mesh(result,combined,material);if(material===materials.meadow)item.castShadow=false;}}
  for(const item of old)item.geometry.dispose();
  return result;
}

const WORLD_PATHS=[
  [[-9,-1.4],[-5,0],8],[[-5,0],[4,0],15],[[4,0],[9,-3.5],10],[[-5,0],[-11,5],12],[[4,0],[10,7],13],
  [[-11,5],[-15,9],10],[[-15,9],[-18,10.8],7],[[-5,0],[0,10.5],19],[[0,10.5],[12,10.5],20],[[12,10.5],[21,8],15],
  [[15,-3],[21,-3],11],[[21,-3],[20,-11],14],[[20,-11],[0,-11],34],[[0,-11],[-16,-11],26],[[-16,-11],[-21,-3],16],[[-21,-3],[-21,5],14],
];

function grassland(p) {
  const positions=[],uvs=[],colors=[],indices=[],shade=new THREE.Color();
  const nearPath=(x,z)=>WORLD_PATHS.some(([a,b])=>{
    const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<.55;
  });
  let blades=0;
  for(let row=0;row<84;row++)for(let col=0;col<112;col++){
    const seed=row*113+col,a=seed*2.39996,x=-27.7+col*.5+Math.sin(a)*.17,z=-20.7+row*.5+Math.cos(a*1.3)*.17;
    if((x/27.5)**2+(z/20.5)**2>1||nearPath(x,z))continue;
    // 花园自身管理地被；屋内与入口保持干净，细草不改变寻路边界。
    if(x>-4.7&&x<5&&z>-10.8&&z<-1.45)continue;
    if(x>-12.6&&x<-4.8&&z>-9&&z<-1.5)continue;
    if(x>5.7&&x<11.9&&z>-8.2&&z<-3.7)continue;
    for(let j=0;j<2;j++){
      const angle=a+j*1.8,dx=Math.cos(angle),dz=Math.sin(angle),height=.07+(seed%7)*.014,width=.018+(seed%3)*.007;
      const offset=positions.length/3,bend=.065;
      shade.setHex([0x99ad71,0xa5b981,0x8fa268,0xb6c28a][seed%4]);
      for(let level=0;level<3;level++)for(const side of [-1,1]){
        const t=level/2,w=width*(1-t*.93),lean=bend*t*t;
        positions.push(x+side*dx*w+dz*lean,.018+height*t,z+side*dz*w-dx*lean);
        uvs.push((side+1)/2,t);colors.push(shade.r,shade.g,shade.b);
      }
      indices.push(offset,offset+1,offset+2,offset+1,offset+3,offset+2,offset+2,offset+3,offset+4,offset+3,offset+5,offset+4);blades++;
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const meadow=mesh(p,geometry,'meadow');meadow.castShadow=false;
  return blades;
}

function gardenEdges(p) {
  const clusters=[[-12.5,-7.4],[-12.5,-4.7],[-11.8,-2.65],[-6.2,-2.7],[-5,-7.8],[6,-7.75],[10.3,-8.1],[11.9,-6.4],[11.9,-4.2]];
  for(let i=0;i<clusters.length;i++){
    const [x,z]=clusters[i];
    for(let j=0;j<6;j++){
      const a=j*2.4,r=.22+(j%3)*.15;
      leaflet(p,x+Math.cos(a)*r,.16+(j%2)*.07,z+Math.sin(a)*r,.32,.19,.27,j%3?'leaf':'leafLight');
      if(j%2===0){const stemX=x+Math.cos(a)*r,stemZ=z+Math.sin(a)*r;
        beam(p,[stemX,.1,stemZ],[stemX,.42,stemZ],.012,'flowerLeaf');blossom(p,stemX,.43,stemZ,.8,i%3?'cream':'yellow');
      }
    }
  }
}

export function buildParkWorld() {
  const world=new THREE.Group();
  const earth=cylinder(world,1,1,.95,'earth',0,-.55,0,100);earth.scale.set(PARK_SIZE.x,.9,PARK_SIZE.z);
  const grass=cylinder(world,1,1,.25,'grass',0,-.12,0,100);grass.scale.set(PARK_SIZE.x,1,PARK_SIZE.z);
  const rim=mesh(world,new THREE.TorusGeometry(1,.025,6,120),'edge',0,-.02,0);rim.rotation.x=Math.PI/2;rim.scale.set(PARK_SIZE.x-.2,PARK_SIZE.z-.2,1.7);
  cabin(world);shop(world);swing(world,-12.4,3.2);bench(world,12,1.7);fountain(world);arcade(world);
  TREE_POSITIONS.forEach(([x,z],i)=>tree(world,x,z,i));
  for(const [a,b,count] of WORLD_PATHS)path(world,a,b,count);
  for(const [x,z,a] of [[-15,1,0],[-12,8,.5],[13,9,-.5],[15,-1,1.1],[-4,-17,0],[21,7,1.4],[-15,-13,.2]]) fence(world,x,z,a);
  for(const [x,z] of [[-13,7],[-10,8],[-6,-2],[6,-2],[13,3],[12,9],[21,-5],[-20,-6],[1,-17]])flowerpot(world,x,z,1.15);
  for(let i=0;i<80;i++){const a=i*2.39996,r=.94+(i%3)*.008;const x=Math.cos(a)*PARK_SIZE.x*r,z=Math.sin(a)*PARK_SIZE.z*r;ball(world,x,.18,z,.35,.25,.3,i%2?'leafLight':'edge');if(i%3===0)ball(world,x,.42,z,.08,.09,.08,'cream');}
  const grassBlades=grassland(world);gardenEdges(world);
  const result=ownResources(mergeStatic(world));result.name='refined-park-world';result.userData.grassBlades=grassBlades;
  return result;
}

export function buildToy(id) {
  const p=new THREE.Group();
  if(id==='eucalyptus-swing')swing(p,0,0,.8);
  if(id==='forest-tea-set'){table(p,0,0,1.35);for(const x of [-1.1,1.1]){cylinder(p,.36,.36,.14,'sage',x,.55,0);for(const z of [-.2,.2])box(p,.1,.5,.1,'wood',x,.25,z);}}
  if(id==='story-tent'){
    const shape=new THREE.Shape();shape.moveTo(-1.2,0);shape.lineTo(0,2);shape.lineTo(1.2,0);shape.closePath();
    const tent=mesh(p,new THREE.ExtrudeGeometry(shape,{depth:1.9,bevelEnabled:false}),'sage',0,0,-1);
    const opening=new THREE.Shape();opening.moveTo(-.75,0);opening.lineTo(0,1.45);opening.lineTo(.75,0);opening.closePath();mesh(p,new THREE.ShapeGeometry(opening),'darkWood',0,.03,.91);
    for(const z of [-1.05,.97]){beam(p,[-1.25,0,z],[.13,2.2,z],.06,'lightWood');beam(p,[1.25,0,z],[-.13,2.2,z],.06,'lightWood');}box(p,1.1,.15,.5,'cream',0,.12,1);
  }
  if(id==='little-train'){
    box(p,1.1,.2,2.8,'wood',0,.36,0);box(p,1,.9,.85,'sage',0,.85,-.65);box(p,1.15,.15,1,'lightWood',0,1.4,-.65);const engine=cylinder(p,.43,.43,1.2,'sage',0,.85,.4);engine.rotation.x=Math.PI/2;cylinder(p,.18,.16,.45,'darkWood',0,1.35,.7);
    for(const x of [-.6,.6])for(const z of [-.8,.75]){const wheel=cylinder(p,.32,.32,.15,'darkWood',x,.32,z);wheel.rotation.z=Math.PI/2;}
  }
  if(id==='reading-bench'){
    bench(p,0,0);box(p,.55,.08,.42,'sage',.6,.84,.1);box(p,.5,.05,.38,'cream',.6,.91,.1);
  }
  if(id==='flower-cart'){
    box(p,1.8,.22,1.2,'lightWood',0,.58,0);for(const x of [-.85,.85])box(p,.12,.5,1.2,'wood',x,.85,0);
    for(const z of [-.55,.55])box(p,1.8,.5,.1,'wood',0,.85,z);
    for(const x of [-.8,.8])for(const z of [-.45,.45]){const wheel=cylinder(p,.3,.3,.13,'darkWood',x,.3,z);wheel.rotation.z=Math.PI/2;}
    beam(p,[-.6,.65,-.5],[-.6,1.1,-1.3],.055);beam(p,[.6,.65,-.5],[.6,1.1,-1.3],.055);beam(p,[-.6,1.1,-1.3],[.6,1.1,-1.3],.055);
    const blooms=group(p);blooms.position.y=.7;flowerpot(blooms,-.43,0,.8);flowerpot(blooms,.43,0,.8);
  }
  if(id==='hammock'){
    for(const x of [-1.3,1.3]){beam(p,[x,0,0],[x,1.65,0],.1);beam(p,[x-.3,.08,-.6],[x+.3,.08,.6],.1);}
    for(let i=0;i<9;i++){const x=-1.18+i*.295,y=.78+x*x*.4;box(p,.32,.09,.95,i%3?'cream':'sage',x,y,0);}
    box(p,.48,.18,.65,'pink',.72,1.13,0);beam(p,[-1.3,1.65,0],[-1.15,1.32,0],.025,'cream');beam(p,[1.3,1.65,0],[1.15,1.32,0],.025,'cream');
  }
  if(id==='picnic-set'){
    for(let x=0;x<6;x++)for(let z=0;z<5;z++)box(p,.5,.035,.5,(x+z)%2?'cream':'pink',-1.25+x*.5,.035,-1+z*.5,.01);
    box(p,.8,.45,.6,'wood',-.65,.3,-.5);const handle=mesh(p,new THREE.TorusGeometry(.25,.035,6,18),'lightWood',-.65,.65,-.5);handle.scale.x=1.4;
    cylinder(p,.35,.35,.04,'cream',.65,.1,.35);for(const x of [.5,.8])ball(p,x,.24,.3,.14,.14,.14,'yellow');cylinder(p,.12,.12,.22,'sage',.6,.16,-.45);
  }
  if(id==='mushroom-lamp'){
    for(const [x,z,s] of [[-.45,0,1],[.5,.3,.65]]){const g=group(p,x,z);g.scale.setScalar(s);cylinder(g,.2,.3,1.3,'cream',0,.65,0);const cap=ball(g,0,1.35,0,.75,.43,.75,'yellow');for(const [dx,dz] of [[-.3,.2],[.2,.35],[.1,-.3]])ball(g,dx,1.68,dz,.1,.035,.1,'cream');}
  }
  if(id==='bird-bath'){
    cylinder(p,.6,.75,.18,'stone',0,.1,0);cylinder(p,.2,.32,1.1,'stone',0,.7,0);cylinder(p,.8,.45,.2,'stone',0,1.35,0,32);cylinder(p,.72,.72,.04,'water',0,1.47,0,32);const rim=mesh(p,new THREE.TorusGeometry(.75,.08,8,32),'stone',0,1.48,0);rim.rotation.x=Math.PI/2;flowerpot(p,-.85,.55,.65);
  }
  if(id==='book-nook'){
    shelf(p,0,0);box(p,2.3,2.2,.12,'sage',0,1.2,-.28);for(const x of [-.6,.6])box(p,.15,.35,.6,'wood',x,.15,0);
    for(const side of [-1,1]){const roof=box(p,1.5,.15,.95,'sage',side*.58,2.67,0);roof.rotation.z=-side*.42;}
  }
  if(id==='telescope'){
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3;beam(p,[Math.sin(a)*.95,0,Math.cos(a)*.95],[0,1.35,0],.07,'wood');}
    const scope=group(p);scope.position.y=1.65;scope.rotation.x=-.65;
    const tube=cylinder(scope,.25,.23,1.5,'book',0,0,0);tube.rotation.x=Math.PI/2;
    const lens=cylinder(scope,.27,.27,.12,'darkWood',0,0,.8);lens.rotation.x=Math.PI/2;const glass=cylinder(scope,.22,.22,.015,'water',0,0,.87);glass.rotation.x=Math.PI/2;
  }
  if(id==='slide'){
    for(const x of [-.55,.55]){beam(p,[x,0,-.8],[x,1.75,-.8],.09);beam(p,[x,0,-1.5],[x,1.75,-.8],.07);}
    box(p,1.25,.15,.85,'lightWood',0,1.7,-.55);
    const chute=box(p,1.15,.1,2.5,'pink',0,.95,.6);chute.rotation.x=.6;
    for(const x of [-.63,.63]){const edge=box(p,.12,.25,2.55,'cream',x,1.1,.55);edge.rotation.x=.6;beam(p,[x,1.8,-.85],[x,2.35,-.85],.07);}
    for(let i=0;i<5;i++)box(p,1.08,.12,.2,'lightWood',0,.24+i*.32,-1.42+i*.12);
  }
  if(id==='music-box'){
    for(const x of [-1,1])for(const z of [-.4,.4])beam(p,[x,0,z],[x,.8,z],.07);
    box(p,2.5,.16,1.05,'wood',0,.82,0);
    for(let i=0;i<7;i++){const length=.9-i*.06;box(p,.26,.13,length,['pink','yellow','sage','book','cream','sage','pink'][i],-.98+i*.325,.97,0);}
    beam(p,[-.7,1.08,.2],[.2,1.08,-.3],.03,'darkWood');ball(p,.2,1.08,-.3,.09,.09,.09,'darkWood');beam(p,[.6,1.08,.3],[-.2,1.08,-.15],.03,'darkWood');ball(p,-.2,1.08,-.15,.09,.09,.09,'darkWood');
  }
  return ownResources(p);
}
