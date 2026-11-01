import * as THREE from '../vendor/three/three.module.js';
import { RoundedBoxGeometry } from '../vendor/three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { PARK_SECRETS, TRAIL_ROUTE } from './core/park-adventure-rules.mjs';
import { findWalkingPath } from './core/park-navigation.mjs';

const colors={wood:0xb98c61,darkWood:0x806349,lightWood:0xd2ad7d,cream:0xf6edda,sage:0x879f78,leaf:0x79977c,leafDark:0x637f6c,stone:0xc8c3ac,ink:0x52636a,blue:0x8b9caa,yellow:0xe7cd85,orange:0xc98b56,soil:0xb49573,mud:0x897058,hill:0x94a58f,hillLight:0xafbca7,hillFar:0xc5cdbb};

// 每次构造独立持有材质和纹理，和乐园现有的 traverse 释放方式保持一致。
function makeTools() {
  const materials=Object.fromEntries(Object.entries(colors).map(([name,color])=>[name,new THREE.MeshStandardMaterial({color,roughness:.88})]));
  const mesh=(parent,geometry,material,x=0,y=0,z=0)=>{
    const item=new THREE.Mesh(geometry,typeof material==='string'?materials[material]:material);
    item.position.set(x,y,z);item.castShadow=true;item.receiveShadow=true;parent.add(item);return item;
  };
  const box=(p,w,h,d,m,x=0,y=0,z=0,r=.035)=>mesh(p,new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)),m,x,y,z);
  const cylinder=(p,rt,rb,h,m,x=0,y=0,z=0,n=14)=>mesh(p,new THREE.CylinderGeometry(rt,rb,h,n),m,x,y,z);
  const ball=(p,x,y,z,sx,sy,sz,m)=>{const item=mesh(p,new THREE.SphereGeometry(1,12,8),m,x,y,z);item.scale.set(sx,sy,sz);return item;};
  const group=(p,name,x=0,y=0,z=0)=>{const item=new THREE.Group();item.name=name;item.position.set(x,y,z);p.add(item);return item;};
  const beam=(p,a,b,r,m='wood')=>{
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),item=cylinder(p,r,r,start.distanceTo(end),m);
    item.position.copy(start).add(end).multiplyScalar(.5);item.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());return item;
  };
  const sign=(p,text,width,height,x,y,z)=>{
    box(p,width,height,.06,'lightWood',x,y,z,.025);
    let texture;
    if(globalThis.document?.createElement) {
      const canvas=document.createElement('canvas');canvas.width=768;canvas.height=160;
      const context=canvas.getContext('2d');
      if(context) {
        context.fillStyle='#f6edda';context.fillRect(0,0,768,160);context.fillStyle='#52636a';context.textAlign='center';context.textBaseline='middle';
        context.font='600 56px system-ui, sans-serif';context.fillText(text,384,84,710);texture=new THREE.CanvasTexture(canvas);
      }
    }
    if(!texture)texture=new THREE.DataTexture(new Uint8Array([246,237,218,255]),1,1);
    texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
    const material=new THREE.MeshStandardMaterial({map:texture,roughness:.9});
    const face=mesh(p,new THREE.PlaneGeometry(width*.95,height*.88),material,x,y,z+.032);face.castShadow=false;return face;
  };
  return {materials,mesh,box,cylinder,ball,group,beam,sign};
}

// 只合并指定的静态子组；互动根组和轻摆的部件保留原有身份。
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inverse=new THREE.Matrix4().copy(root.matrixWorld).invert(),buckets=new Map(),old=[];
  root.traverse((item)=>{
    if(!item.isMesh)return;
    const geometry=item.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,item.matrixWorld));
    const plain=geometry.index?geometry.toNonIndexed():geometry;if(plain!==geometry)geometry.dispose();
    if(!item.material.map)plain.deleteAttribute('uv');
    const list=buckets.get(item.material)||[];list.push(plain);buckets.set(item.material,list);old.push(item);
  });
  root.clear();
  for(const [material,geometries] of buckets) {
    const combined=mergeGeometries(geometries,false);for(const geometry of geometries)geometry.dispose();
    if(combined){const item=new THREE.Mesh(combined,material);item.castShadow=true;item.receiveShadow=true;root.add(item);}
  }
  for(const item of old)item.geometry.dispose();
}

function translatorDesk(p,t) {
  const {box,cylinder,ball,beam,sign}=t;
  box(p,2.08,.12,.86,'lightWood',0,1.02,-.26);
  for(const x of [-.86,.86])for(const z of [-.57,.05])box(p,.1,.94,.1,'wood',x,.49,z);
  box(p,1.7,.09,.08,'wood',0,.28,-.57);
  box(p,.55,.1,.42,'sage',.08,.6,.52);
  for(const x of [-.13,.29])for(const z of [.36,.67])box(p,.055,.58,.055,'wood',x,.3,z);
  for(const x of [-.15,.31])box(p,.055,.68,.055,'wood',x,.98,.73);
  box(p,.52,.3,.1,'sage',.08,1.17,.73);
  // 打字机的纸辊、键盘和译稿纸，仍然采用柔和的木质与蓝灰配色。
  box(p,.68,.13,.38,'blue',-.06,1.14,-.28);
  box(p,.55,.08,.25,'ink',-.06,1.22,-.35);
  const roller=cylinder(p,.057,.057,.58,'ink',-.06,1.35,-.43);roller.rotation.z=Math.PI/2;
  box(p,.37,.36,.012,'cream',-.06,1.52,-.425,.003);
  for(let row=0;row<4;row++)box(p,.23-row%2*.04,.008,.003,'blue',-.06,1.6-row*.045,-.416,.001);
  for(let row=0;row<3;row++)for(let i=0;i<7;i++)ball(p,-.29+i*.077,1.225+row*.008,-.18+row*.055,.025,.012,.02,'cream');
  box(p,.35,.13,.46,'sage',-.72,1.145,-.27,.015);box(p,.3,.085,.43,'cream',-.71,1.15,-.25,.008);
  box(p,.035,.13,.46,'leafDark',-.88,1.145,-.27,.006);box(p,.1,.008,.16,'yellow',-.73,1.217,-.27,.003);
  box(p,.34,.018,.25,'cream',.43,1.09,-.03,.003);
  for(let row=0;row<3;row++)box(p,.23-row%2*.05,.003,.008,'blue',.43,1.102,-.1+row*.055,.001);
  cylinder(p,.14,.16,.04,'ink',.75,1.1,-.42);
  beam(p,[.75,1.11,-.42],[.75,1.62,-.42],.025,'ink');beam(p,[.75,1.62,-.42],[.53,1.76,-.42],.025,'ink');
  cylinder(p,.07,.19,.16,'sage',.5,1.69,-.42);cylinder(p,.15,.15,.008,'yellow',.5,1.606,-.42);
  sign(p,'森林翻译官',.79,.18,-.06,.88,.19);
}

function forestLetter(p,t) {
  const {box,cylinder,beam,sign,mesh,group}=t;
  cylinder(p,.24,.3,.09,'stone',0,.045,0);cylinder(p,.07,.09,1.18,'wood',0,.64,0);
  box(p,.7,.26,.46,'sage',0,1.27,0);
  const arch=cylinder(p,.23,.23,.7,'sage',0,1.4,0,24);arch.rotation.z=Math.PI/2;
  box(p,.43,.04,.018,'ink',0,1.43,.236,.006);
  box(p,.37,.2,.025,'cream',0,1.2,.246,.01);
  beam(p,[-.17,1.28,.262],[0,1.18,.262],.008,'wood');beam(p,[0,1.18,.262],[.17,1.28,.262],.008,'wood');
  sign(p,'POST',.29,.13,0,.91,.079);
  const flag=group(p,'adventure-letter-flag',.39,1.38,0);
  beam(flag,[0,-.13,0],[0,.3,0],.018,'darkWood');box(flag,.13,.14,.025,'orange',.06,.24,0,.015);
  const stamp=mesh(p,new THREE.CircleGeometry(.035,12),'yellow',.125,1.24,.263);stamp.rotation.z=.2;
}

function idiomRadio(p,t) {
  const {box,cylinder,beam,sign,group}=t;
  box(p,.92,.07,.54,'lightWood',0,.67,0);
  for(const x of [-.37,.37])for(const z of [-.19,.19])box(p,.07,.64,.07,'wood',x,.32,z);
  box(p,.77,.48,.31,'wood',0,.96,0,.07);box(p,.7,.4,.012,'cream',0,.96,.16,.045);
  const speaker=cylinder(p,.16,.16,.022,'ink',-.17,.96,.18,24);speaker.rotation.x=Math.PI/2;
  for(let i=0;i<5;i++)box(p,.014,.2,.012,'blue',-.26+i*.045,.96,.198,.005);
  box(p,.23,.065,.015,'blue',.21,1.075,.18,.01);
  const dial=group(p,'adventure-radio-dial',.21,1.075,.195);box(dial,.008,.05,.006,'yellow',0,0,0,.001);
  for(const x of [.15,.29]){const knob=cylinder(p,.045,.045,.026,'ink',x,.91,.192);knob.rotation.x=Math.PI/2;}
  beam(p,[-.2,1.2,-.06],[.04,1.76,-.06],.012,'ink');
  beam(p,[-.25,1.2,0],[-.25,1.3,0],.018,'darkWood');beam(p,[.25,1.2,0],[.25,1.3,0],.018,'darkWood');beam(p,[-.25,1.3,0],[.25,1.3,0],.02,'darkWood');
  sign(p,'双语电台 · ON AIR',.82,.15,0,.52,.258);
}

function tinyCrown(p,t) {
  const {cylinder,ball,mesh,beam,sign}=t;
  cylinder(p,.31,.4,.34,'stone',0,.17,0,11);cylinder(p,.29,.32,.6,'lightWood',0,.64,0,14);cylinder(p,.38,.38,.08,'wood',0,.98,0,24);
  const rim=mesh(p,new THREE.TorusGeometry(.255,.035,6,24),'yellow',0,1.065,0);rim.rotation.x=Math.PI/2;
  for(let i=0;i<9;i++) {
    const a=i/9*Math.PI*2,x=Math.cos(a)*.25,z=Math.sin(a)*.25;
    const leaf=ball(p,x,1.23+(i%2)*.035,z,.066,.18,.028,i%3?'leaf':'sage');leaf.rotation.set(Math.sin(a)*.28,-a,Math.cos(a)*-.28);
    beam(p,[x*.92,1.1,z*.92],[x,1.33,z],.008,'yellow');
  }
  sign(p,'先听，再翻译',.5,.14,0,.68,.255);
}

function trailStart(p,t) {
  const {cylinder,box,sign,mesh,group}=t;
  for(const x of [-1.55,1.55]) {
    cylinder(p,.13,.14,3,'wood',x,1.5,0);box(p,.17,.12,.025,'orange',x,.72,.09,.01);
  }
  box(p,3.32,.34,.18,'lightWood',0,2.83,0,.045);sign(p,'林间开跑 · KOALA 01',2.92,.25,0,2.84,.1);
  const flags=group(p,'adventure-start-pennants',0,2.61,0);
  for(let i=0;i<7;i++) {
    const shape=new THREE.Shape();shape.moveTo(-.12,0);shape.lineTo(.12,0);shape.lineTo(0,-.23);shape.closePath();
    const flag=mesh(flags,new THREE.ShapeGeometry(shape),i%2?'cream':'orange',-.96+i*.32,0,.015);flag.material.side=THREE.DoubleSide;
  }
  mergeStatic(flags);
  sign(p,'01',.15,.2,-1.55,1.45,.075);
}

function bananaAid(p,t) {
  const {box,cylinder,beam,mesh,sign,ball}=t;
  for(const x of [-.85,.85])for(const z of [-.46,.46])cylinder(p,.04,.05,2.23,'wood',x,1.115,z);
  for(let i=0;i<6;i++) {
    const left=-.99+i*.33,right=left+.33,y=(x)=>2.23+.12*(1-(x/.99)**2);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([left,y(left),-.58,right,y(right),-.58,left,y(left),.58,right,y(right),-.58,right,y(right),.58,left,y(left),.58],3));geometry.computeVertexNormals();
    const roof=mesh(p,geometry,i%2?'sage':'cream');roof.material.side=THREE.DoubleSide;
  }
  box(p,1.72,.1,.66,'lightWood',0,1.01,.06);
  for(const x of [-.69,.69])for(const z of [-.19,.29])box(p,.08,.96,.08,'wood',x,.49,z);
  beam(p,[-.69,.27,-.19],[.69,.27,-.19],.035,'wood');
  for(let i=0;i<3;i++) {
    const points=[[-.22,0,0],[-.14,-.09,0],[.04,-.13,0],[.2,-.035,0]].map(([x,y,z])=>new THREE.Vector3(x-.35,y+1.23,z+.01+i*.085));
    mesh(p,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),9,.044,5,false),'yellow');
    ball(p,-.57,1.23,.01+i*.085,.027,.028,.026,'darkWood');ball(p,-.15,1.195,.01+i*.085,.022,.027,.022,'darkWood');
  }
  for(const x of [.27,.57]) {
    cylinder(p,.075,.09,.32,'blue',x,1.22,.08);cylinder(p,.045,.045,.075,'cream',x,1.417,.08);cylinder(p,.052,.052,.035,'orange',x,1.468,.08);
    box(p,.1,.13,.012,'cream',x,1.235,.17,.008);
  }
  sign(p,'桉叶补给站 · AID',1.28,.22,0,2.02,.51);
  box(p,.45,.24,.34,'wood',-.34,.35,.05);box(p,.35,.11,.355,'lightWood',-.34,.43,.05);
}

function summitBell(p,t) {
  const {cylinder,box,beam,mesh,ball,group,sign}=t;
  cylinder(p,.38,.46,.13,'stone',0,.065,0,9);
  for(const x of [-.34,.34])beam(p,[x,.1,0],[x,1.77,0],.05,'wood');box(p,.86,.11,.13,'lightWood',0,1.78,0);
  beam(p,[0,1.73,0],[0,1.61,0],.016,'ink');
  const bell=group(p,'adventure-wind-bell',0,1.57,0);
  cylinder(bell,.085,.18,.24,'yellow',0,-.08,0,24);
  const rim=mesh(bell,new THREE.TorusGeometry(.18,.022,6,24),'yellow',0,-.2,0);rim.rotation.x=Math.PI/2;
  beam(bell,[0,-.07,0],[0,-.25,0],.012,'darkWood');ball(bell,0,-.25,0,.036,.045,.036,'darkWood');
  sign(p,'远山有风',.71,.21,0,.89,.09);
  const arrow=new THREE.Shape();arrow.moveTo(-.26,-.07);arrow.lineTo(.12,-.07);arrow.lineTo(.12,-.13);arrow.lineTo(.3,0);arrow.lineTo(.12,.13);arrow.lineTo(.12,.07);arrow.lineTo(-.26,.07);arrow.closePath();
  mesh(p,new THREE.ExtrudeGeometry(arrow,{depth:.035,bevelEnabled:false}),'orange',0,.57,.08);
}

function muddyShoes(p,t) {
  const {box,ball,beam,group}=t;
  for(const side of [-1,1]) {
    const shoe=group(p,'trail-shoe',side*.18,0,0);shoe.rotation.y=side*.12;
    box(shoe,.27,.065,.62,'mud',0,.072,0,.055);ball(shoe,0,.19,.03,.132,.12,.26,'blue');
    ball(shoe,0,.21,.17,.132,.075,.13,'sage');box(shoe,.23,.22,.19,'blue',0,.21,-.19,.055);
    ball(shoe,0,.317,-.18,.079,.014,.067,'ink');box(shoe,.12,.13,.06,'cream',0,.29,-.02,.015);
    for(let i=0;i<3;i++)beam(shoe,[-.073,.29-i*.019,-.05+i*.062],[.073,.29-i*.019,-.05+i*.062],.011,'cream');
    for(const x of [-.12,.12])for(const z of [-.17,.06,.18])ball(shoe,x,.125,z,.025,.04,.05,'mud');
    box(shoe,.13,.04,.035,'orange',0,.23,-.297,.01);
  }
}

function trailGround(p,t,points) {
  const {mesh,cylinder,ball,beam,group}=t;
  const ground=group(p,'adventure-trail-ground');
  const markers=group(p,'adventure-trail-markers');
  const samples=[];
  for(let i=1;i<points.length;i++) {
    const start=points[i-1],end=points[i],count=Math.max(1,Math.ceil(Math.hypot(end.x-start.x,end.z-start.z)/.7));
    for(let j=0;j<count;j++){const fraction=j/count;samples.push({x:start.x+(end.x-start.x)*fraction,z:start.z+(end.z-start.z)*fraction});}
  }
  samples.push(points.at(-1));
  const positions=[];
  for(let i=0;i<samples.length-1;i++) {
    const a=samples[i],b=samples[i+1],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz)||1;
    const width=.42+Math.sin(i*1.7)*.035,nx=-dz/length*width,nz=dx/length*width;
    positions.push(a.x+nx,.024,a.z+nz,b.x+nx,.024,b.z+nz,a.x-nx,.024,a.z-nz,b.x+nx,.024,b.z+nz,b.x-nx,.024,b.z-nz,a.x-nx,.024,a.z-nz);
    if(i%9===0)for(const side of [-1,1]){const stone=cylinder(ground,.045,.065,.026,'stone',a.x+nx*side*.8,.036,a.z+nz*side*.8,7);stone.scale.z=.6;}
    if(i%27===7) {
      const x=a.x+nx*1.8,z=a.z+nz*1.8;
      beam(markers,[x,0,z],[x,.46,z],.015,'wood');
      const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(.21,-.06);shape.lineTo(0,-.15);shape.closePath();
      const flag=mesh(markers,new THREE.ShapeGeometry(shape),'orange',x,.45,z);flag.material.side=THREE.DoubleSide;
    }
  }
  const ribbon=new THREE.BufferGeometry();ribbon.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));ribbon.computeVertexNormals();
  const path=mesh(ground,ribbon,'soil');path.material.side=THREE.DoubleSide;path.castShadow=false;
  // 泥脚印属于可穿过的地面装饰，鞋子本身保留独立的点击身份。
  for(let i=0;i<9;i++) {
    const x=-20.12+i*.18,z=13.43-i*.16+(i%2)*.19,print=group(ground,'mud-footprint',x,.014,z);print.rotation.y=-.8;
    ball(print,0,.005,.035,.065,.006,.12,'mud');ball(print,0,.005,-.105,.048,.006,.045,'mud');
  }
  mergeStatic(ground);
  mergeStatic(markers);
}

function distantRidgeGeometry(radiusX,radiusZ,width,height,phase) {
  const positions=[],indices=[],segments=96,rows=22;
  for(let row=0;row<=rows;row++)for(let col=0;col<=segments;col++){
    const depth=row/rows,angle=-1.44+col/segments*2.88;
    const ridge=height+Math.sin(angle*3.4+phase)*.75+Math.sin(angle*7.3-phase)*.3;
    const taper=Math.pow(Math.sin(col/segments*Math.PI),.55);
    const elevation=(row===0||row===rows||col===0||col===segments)?0:ridge*Math.pow(Math.sin(depth*Math.PI),1.5)*taper;
    positions.push(Math.sin(angle)*(radiusX+width*depth),-1.04+elevation,-Math.cos(angle)*(radiusZ+width*depth));
    if(row<rows&&col<segments){const a=row*(segments+1)+col,b=a+segments+1;indices.push(a,a+1,b,a+1,b+1,b);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function landscape(p,t) {
  const {group,mesh,ball,cylinder,beam}=t;
  const hills=group(p,'adventure-distant-hills');
  // 连续坡面在岛外环绕后景；边缘落地，避免椭球底部悬浮的石块感。
  for(const [rx,rz,width,height,phase,material] of [[33,27,15,4.6,.4,'hill'],[43,35,17,5.5,2.1,'hillLight'],[54,44,19,6.3,4,'hillFar']]) {
    const hill=mesh(hills,distantRidgeGeometry(rx,rz,width,height,phase),material);hill.castShadow=false;
  }
  mergeStatic(hills);for(const hill of hills.children){hill.castShadow=false;hill.receiveShadow=false;}
  // 野花与碎石只在路径旁点缀，不增加需要绕开的实体。
  const flowers=group(p,'adventure-wildflowers');
  for(const [x,z] of [[-16.5,-7.8],[-21.8,-5.9],[-3,-12.9],[13.1,-15.6],[21.4,-8.2],[19.8,10.7],[-18.9,13.4],[-21.8,1.1],[.4,12.6]]) {
    for(let i=0;i<3;i++) {
      const dx=Math.cos(i*2.4)*.22,dz=Math.sin(i*2.4)*.17;
      beam(flowers,[x+dx,0,z+dz],[x+dx,.19+i%2*.07,z+dz],.009,'leaf');
      for(let petal=0;petal<5;petal++){const a=petal*Math.PI*2/5;ball(flowers,x+dx+Math.cos(a)*.035,.2+i%2*.07,z+dz+Math.sin(a)*.035,.035,.021,.035,i%2?'cream':'yellow');}
    }
    for(let i=0;i<2;i++){const rock=cylinder(flowers,.09,.13,.09,'stone',x-.34+i*.17,.045,z-.2,7);rock.rotation.y=i*1.1;rock.scale.z=.8;}
  }
  mergeStatic(flowers);
}

export function buildAdventureWorld() {
  const world=new THREE.Group();world.name='adventure-world';
  const t=makeTools(),decorations=t.group(world,'adventure-landscape');
  const points=[{...TRAIL_ROUTE[0]}];
  for(let i=1;i<TRAIL_ROUTE.length;i++)points.push(...findWalkingPath(TRAIL_ROUTE[i-1],TRAIL_ROUTE[i]));
  world.userData.trailRoutePoints=points.map(({x,z})=>({x,z}));
  trailGround(decorations,t,points);landscape(decorations,t);
  const builders={'translator-desk':translatorDesk,'forest-letter':forestLetter,'idiom-radio':idiomRadio,'tiny-crown':tinyCrown,'trail-start':trailStart,'banana-aid':bananaAid,'summit-bell':summitBell,'muddy-shoes':muddyShoes};
  for(const secret of PARK_SECRETS) {
    const root=t.group(world,secret.id,secret.position.x,0,secret.position.z);root.userData.secretId=secret.id;
    const parts=t.group(root,'secret-static');builders[secret.id](parts,t);
    // 动画组从静态几何中取出，减少大部分景物的渲染次数。
    for(const name of ['adventure-letter-flag','adventure-radio-dial','adventure-start-pennants','adventure-wind-bell']) {
      const part=parts.getObjectByName(name);if(part){parts.remove(part);root.add(part);}
    }
    mergeStatic(parts);
  }
  // 未被模型使用的调色板条目也当场释放，避免留下不可遍历的资源。
  const used=new Set();world.traverse((item)=>{if(item.material)used.add(item.material);});
  for(const material of Object.values(t.materials))if(!used.has(material))material.dispose();
  return world;
}

export function animateAdventureWorld(root,elapsed) {
  if(!root?.isObject3D||!Number.isFinite(elapsed))return;
  const bell=root.getObjectByName('adventure-wind-bell');if(bell)bell.rotation.z=Math.sin(elapsed*1.7)*.055;
  const flag=root.getObjectByName('adventure-letter-flag');if(flag)flag.rotation.z=Math.sin(elapsed*1.2)*.025;
  const dial=root.getObjectByName('adventure-radio-dial');if(dial)dial.position.x=.21+Math.sin(elapsed*.7)*.035;
  const pennants=root.getObjectByName('adventure-start-pennants');if(pennants)pennants.rotation.x=Math.sin(elapsed*1.1)*.07;
}
