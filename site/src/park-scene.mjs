import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from '../vendor/three/addons/controls/OrbitControls.js';
import { buildParkWorld, buildToy } from './park-world.mjs';
import { buildParkNpcs, animateParkNpcs } from './park-npcs.mjs';
import { PARK_NPCS } from './core/park-catalog.mjs';
import { buildKoalaAppearance, disposeKoalaTree, normalizeKoala } from './koala-appearance.mjs';
import { getWardrobe } from './core/wardrobe-rules.mjs';
import { applyKoalaGait } from './koala-gait.mjs';
import { advanceWalk, canWalk, clearSegment, findWalkingPath, findGardenWalkingPath, parkObstacles, PARK_SIZE, SLOT_POSITIONS } from './core/park-navigation.mjs';
import { PARK_SECRETS, TRAIL_ROUTE, getAdventure } from './core/park-adventure-rules.mjs';
import { buildAdventureWorld, animateAdventureWorld } from './park-adventure-world.mjs';
import { FLOWER_CATALOG, GARDEN_BEDS, GARDEN_ENTRANCE, getGarden } from './core/park-garden-rules.mjs';
import { buildGardenWorld, updateGardenWorld, animateGardenWorld, playGardenWater, cancelGardenWater } from './park-garden-world.mjs';
import { createParkLighting, createContactShadow } from './park-lighting.mjs';

function disposeTree(root, materials = true) {
  const geometries=new Set(), mats=new Set(), textures=new Set();
  root.traverse(item=>{if(item.geometry)geometries.add(item.geometry);for(const mat of [item.material].flat().filter(Boolean)){mats.add(mat);for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);}});
  for(const g of geometries)g.dispose();
  if(materials){for(const t of textures){t.dispose();t.source?.data?.close?.();}for(const m of mats)m.dispose();}
}

// 模型没有骨骼：按模型局部坐标为腿和手臂添加轻微的程序步态，保留原网格与贴图。
function addProceduralGait(model, uniforms) {
  const container=normalizeKoala(model);
  applyKoalaGait(container,uniforms);
  return container;
}

export function mountParkScene(host, callbacks) {
  const canvas=host.querySelector('canvas'), loading=host.querySelector('.park-3d-loading'), status=host.querySelector('.park-live-status');
  let renderer;
  try { renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'}); }
  catch { loading.textContent='当前浏览器无法启动 3D 场景，请开启图形加速后重试。';host.classList.add('scene-failed');return {update(){},dispose(){},control(){},setPaused(){}}; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.7));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xf5f4e9);scene.fog=new THREE.Fog(0xf5f4e9,110,190);
  const camera=new THREE.PerspectiveCamera(42,1,.1,240);
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.09;controls.enablePan=true;controls.minDistance=9;controls.maxDistance=150;controls.minPolarAngle=.28;controls.maxPolarAngle=1.34;controls.maxTargetRadius=27;controls.cursor.set(0,0,0);
  scene.add(createParkLighting());
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(250,250),new THREE.MeshStandardMaterial({color:0xf5f2e7,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.05;floor.receiveShadow=true;scene.add(floor);
  const world=buildParkWorld();scene.add(world);
  const residents=buildParkNpcs();scene.add(residents);
  const adventureWorld=buildAdventureWorld();scene.add(adventureWorld);
  const gardenWorld=buildGardenWorld();scene.add(gardenWorld);
  for(const [x,z,width,depth,opacity] of [[-8.7,-5.8,9.8,8,.28],[8.8,-6,7.5,5.8,.24],...GARDEN_BEDS.map(bed=>[bed.position.x,bed.position.z,bed.width*1.3,bed.depth*1.3,.12])]){
    const shadow=createContactShadow(width,depth,opacity);shadow.position.set(x,.025,z);scene.add(shadow);
  }
  const gardenLabels=GARDEN_BEDS.map(bed=>{
    const label=document.createElement('button');label.type='button';label.className='park-garden-label';label.dataset.sceneGarden=bed.id;label.hidden=true;
    label.textContent=bed.name;label.setAttribute('aria-label',`走到${bed.name}照料花草`);host.append(label);return {label,bed};
  });
  const gardenEntry=document.createElement('button');gardenEntry.type='button';gardenEntry.className='park-garden-entry';gardenEntry.dataset.sceneGarden=GARDEN_BEDS[0].id;gardenEntry.textContent='✿ 大王的花园';host.append(gardenEntry);
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const secretLabels=PARK_SECRETS.map(secret=>{
    const label=document.createElement('button');label.type='button';label.className='park-secret-label';label.dataset.sceneSecret=secret.id;label.hidden=true;
    label.textContent='✧ 看看这里';label.setAttribute('aria-label',`探索线索：${secret.hint}`);host.append(label);return {label,secret};
  });
  const npcLabels=PARK_NPCS.map(npc=>{
    const label=document.createElement('button');label.type='button';label.className='park-npc-label';label.dataset.sceneNpc=npc.id;
    const name=document.createElement('strong'),role=document.createElement('small');name.textContent=`${npc.emoji} ${npc.name}`;role.textContent=npc.role;
    label.append(name,role);label.setAttribute('aria-label',`和${npc.name}交谈，${npc.role}`);host.append(label);return {label,npc};
  });
  const props=new THREE.Group(), markers=new THREE.Group();scene.add(props,markers);
  const destination=new THREE.Mesh(new THREE.RingGeometry(.35,.44,40),new THREE.MeshBasicMaterial({color:0xfff9c5,side:THREE.DoubleSide,transparent:true,opacity:.9}));destination.rotation.x=-Math.PI/2;destination.position.y=.035;destination.visible=false;scene.add(destination);
  const actor=new THREE.Group();scene.add(actor);actor.position.set(0,.04,3);
  const actorShadow=createContactShadow(2,1.65,.3);scene.add(actorShadow);
  const gait={time:{value:0},amount:{value:0}};
  const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2(), ground=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  let model=null, appearance=null, previousAppearance='', contextLost=false, disposed=false, paused=false, frame=0, lastTime=0, elapsed=0, path=[], obstacles=parkObstacles(), game=null, selected=null, arranging=false;
  let roam=true, nextRoam=2.5, following=false, markerFade=0, previousPlacement='', position={x:0,z:3}, yaw=0;
  let pointerDown=null, dragged=false, keyboard=new Set(), lastAnnounce=0;
  let pendingSecret=null, trailQueue=[], trailRunning=false, journeyEpoch=0;
  let pendingGarden=null, gardenFocus=null, gardenBusy=false;
  const secretBusy=new Set();
  const listeners=[];
  function on(element,name,fn,options){element.addEventListener(name,fn,options);listeners.push(()=>element.removeEventListener(name,fn,options));}
  function say(message){status.textContent=message;}
  function fitCamera(){
    following=false;host.querySelector('[data-scene-control="follow"]').setAttribute('aria-pressed','false');const portrait=host.clientWidth<600;controls.target.set(0,.5,0);camera.position.set(27,35,43).multiplyScalar(portrait?1.8:1);controls.update();
  }
  function resize(){const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(host);resize();fitCamera();
  async function loadModel(){
    loading.hidden=false;host.classList.remove('scene-failed');loading.textContent='考拉正在走进新乐园…';
    try {
      const gltf=await new GLTFLoader().loadAsync(new URL('../assets/models/koala-main/koala-main.glb', import.meta.url).href);
      if(disposed){disposeTree(gltf.scene);return;}
      model=addProceduralGait(gltf.scene,gait);actor.add(model);refreshAppearance();loading.hidden=true;host.dataset.modelLoaded='true';
      if(host.clientWidth<600){following=true;controls.target.set(position.x,.8,position.z);camera.position.copy(controls.target).add(new THREE.Vector3(10,13,18));host.querySelector('[data-scene-control="follow"]').setAttribute('aria-pressed','true');say('近景跟随 · 点击全景查看整座小岛');}
      else say('考拉准备好了 · 点击草地，或让它自己散步');
    }catch(error){if(disposed)return;loading.textContent='考拉模型未能加载。可以重试，已有书房和乐园数据不会丢失。';host.classList.add('scene-failed');say('模型加载失败');console.error('考拉模型加载失败',error);}
  }
  void loadModel();

  function stopAdventure(){
    journeyEpoch++;pendingSecret=null;trailQueue=[];trailRunning=false;path=[];
    pendingGarden=null;gardenFocus=null;cancelGardenWater(gardenWorld);host.dataset.gardenVisit='';host.dataset.gardenAction='';
    host.dataset.trailRunning='false';host.dataset.secretVisit='';host.querySelector('.park-trail-stop').hidden=true;
  }
  function setRoaming(value){
    roam=Boolean(value);const button=host.querySelector('[data-scene-control="roam"]');
    button.setAttribute('aria-pressed',String(roam));button.textContent=roam?'暂停散步':'自动散步';
  }
  function cancelGardenVisit(pendingOnly=false){
    if(pendingOnly&&!pendingGarden)return;
    if(!pendingGarden&&!gardenFocus)return;
    const unfinished=Boolean(pendingGarden)||gardenBusy;
    stopAdventure();destination.visible=false;if(unfinished)say('花园照料已暂停，可以重新选择花丛。');
  }
  function goTo(target, manual=true, keepAdventure=false){
    if(!model||paused)return false;
    if(!keepAdventure)stopAdventure();
    const next=pendingGarden?findGardenWalkingPath(position,target,obstacles):findWalkingPath(position,target,obstacles);
    if(!next.length){if(manual)say('这里无法到达，请点击空着的草地。');return false;}
    path=next;markerFade=0;destination.position.set(target.x,.04,target.z);destination.visible=manual;
    if(manual){nextRoam=elapsed+12;say('考拉正在走向你选的地方…');}else say('考拉正在草地上散步');
    host.dataset.walkTarget=`${target.x.toFixed(2)},${target.z.toFixed(2)}`;
    return true;
  }
  function followActor(){
    following=true;controls.target.set(position.x,1,position.z);camera.position.copy(controls.target).add(new THREE.Vector3(6,7.5,12));
    host.querySelector('[data-scene-control="follow"]').setAttribute('aria-pressed','true');
  }
  function visitSecret(id){
    const secret=PARK_SECRETS.find(item=>item.id===id);
    if(!secret||!model||paused||arranging)return false;
    if(secretBusy.has(id)){say('正在把故事记进手账…');return true;}
    stopAdventure();pendingSecret=id;host.dataset.secretVisit=id;
    if(!goTo(secret.approach,true,true)){stopAdventure();return false;}
    followActor();say('跟着大王，去看看这条森林线索…');return true;
  }
  function visitGardenBed(id,action={kind:'open'}){
    const bed=GARDEN_BEDS.find(item=>item.id===id);
    if(!bed||!model||paused||arranging||gardenBusy||!['open','plant','water'].includes(action.kind))return false;
    if(action.kind==='plant'&&!FLOWER_CATALOG.some(flower=>flower.id===action.flowerId))return false;
    stopAdventure();setRoaming(false);pendingGarden={id,action:{...action}};host.dataset.gardenVisit=id;host.dataset.gardenAction=action.kind;
    if(!goTo(bed.approach,true,true)){stopAdventure();return false;}
    followActor();say(`考拉正在走进花园，前往${bed.name}…`);return true;
  }
  function waterGarden(id){
    if(disposed||gardenFocus!==id)return;
    playGardenWater(gardenWorld,id,elapsed);host.dataset.gardenAction='watering';say('水滴落进泥土，花朵轻轻舒展开来。');
  }
  function nextTrailPoint(){
    const target=trailQueue.shift();host.dataset.trailWaypointsLeft=String(trailQueue.length);
    if(!target){stopAdventure();destination.visible=false;nextRoam=elapsed+8;say('环线跑完啦！跑过山野，也记得停下来看看风景。');return;}
    pendingSecret=target.secretId||null;
    if(!goTo(target,false,true)){stopAdventure();say('前方暂时无法通行，换个位置再开始跑步吧。');return;}
    say(`考拉大王在林间跑步 · 还剩 ${trailQueue.length+1} 段`);
  }
  function startTrailRun(){
    if(!model||paused||arranging)return false;
    stopAdventure();trailRunning=true;trailQueue=TRAIL_ROUTE.map(point=>({...point}));
    host.dataset.trailRunning='true';host.querySelector('.park-trail-stop').hidden=false;
    followActor();nextTrailPoint();return trailRunning;
  }
  function arrived(){
    if(pendingGarden){
      const {id,action}=pendingGarden,epoch=journeyEpoch,bed=GARDEN_BEDS.find(item=>item.id===id);
      pendingGarden=null;gardenFocus=id;gardenBusy=true;destination.visible=false;
      yaw=Math.atan2(bed.position.x-position.x,bed.position.z-position.z);
      const isCurrent=()=>!disposed&&epoch===journeyEpoch;
      say(action.kind==='open'?`到了${bed.name}，选一种喜欢的花吧。`:'正在照料这片花丛…');
      Promise.resolve().then(()=>isCurrent()?callbacks.onGardenArrive?.(id,action,isCurrent):undefined).then(()=>{
        if(!isCurrent())return;
        if(action.kind!=='water')say(action.kind==='plant'?'花已经种好啦，风会陪它轻轻摇摆。':`考拉在${bed.name}旁等你，可以种花或浇水。`);
      }).catch(error=>{
        if(!isCurrent())return;
        say(`照料暂未保存：${error.message||'请稍后重试'}`);
      }).finally(()=>{gardenBusy=false;});
      return;
    }
    const secretId=pendingSecret, wasRunning=trailRunning, epoch=journeyEpoch;pendingSecret=null;
    if(!secretId||wasRunning&&getAdventure(game).foundIds.includes(secretId)){
      if(wasRunning)nextTrailPoint();else say('考拉大王到啦 · 再点一处草地继续探索');return;
    }
    secretBusy.add(secretId);say('发现了一个小故事，正在记入手账…');
    const isCurrent=()=>!disposed&&epoch===journeyEpoch;
    Promise.resolve().then(()=>callbacks.onSecret?.(secretId,wasRunning,isCurrent)).then(()=>{
      if(disposed||epoch!==journeyEpoch)return;
      host.dataset.secretVisit='';
      if(wasRunning&&trailRunning)nextTrailPoint();else say('故事已记入手账 · 再去找找别的秘密吧');
    }).catch(error=>{
      if(disposed||epoch!==journeyEpoch)return;
      stopAdventure();say(`手账暂未保存：${error.message||'请稍后再试'}。可再次点击物件重试。`);
    }).finally(()=>secretBusy.delete(secretId));
  }
  function refreshProps(){
    disposeTree(props);props.clear();
    for(const item of game?.toyPlacements || []){const point=SLOT_POSITIONS[item.slotId];if(!point)continue;const toy=buildToy(item.toyId);toy.position.set(point.x,.02,point.z);toy.userData.toyId=item.toyId;props.add(toy);}
  }
  function refreshMarkers(){
    disposeTree(markers);markers.clear();
    if(!arranging)return;
    for(const [slotId,point] of Object.entries(SLOT_POSITIONS)){
      const item=game?.toyPlacements?.find(p=>p.slotId===slotId),occupied=item&&item.toyId!==selected;
      const disk=new THREE.Mesh(new THREE.RingGeometry(.85,1.05,48),new THREE.MeshBasicMaterial({color:occupied?0xcac1a2:selected?0xfff3bc:0xe4ebcc,side:THREE.DoubleSide,transparent:true,opacity:.95}));disk.rotation.x=-Math.PI/2;disk.position.set(point.x,.06,point.z);markers.add(disk);
    }
  }
  function refreshAppearance(){
    if(!model||!game)return;
    const fingerprint=JSON.stringify(getWardrobe(game).equipped);
    if(fingerprint===previousAppearance)return;
    if(appearance){model.remove(appearance);disposeKoalaTree(appearance);}
    appearance=buildKoalaAppearance(model,game);
    applyKoalaGait(appearance,gait);
    model.add(appearance);previousAppearance=fingerprint;
    host.dataset.equipped=fingerprint;
  }
  function update(nextGame,panel,toyId){
    game=nextGame;selected=toyId;arranging=panel==='arrange';
    refreshAppearance();
    updateGardenWorld(gardenWorld,game);
    const planted=getGarden(game).beds;
    host.dataset.gardenPlanted=String(planted.length);
    for(const {label,bed} of gardenLabels){const record=planted.find(item=>item.id===bed.id);label.textContent=`${bed.name} · ${FLOWER_CATALOG.find(flower=>flower.id===record?.flowerId)?.name||'待种花'}`;}
    if(panel==='garden'){setRoaming(false);if(!pendingGarden&&!gardenFocus)stopAdventure();}
    else if(panel&&(pendingGarden||gardenFocus))cancelGardenVisit();
    const fingerprint=JSON.stringify(game.toyPlacements || []);
    if(fingerprint!==previousPlacement){previousPlacement=fingerprint;obstacles=parkObstacles(game.toyPlacements);refreshProps();stopAdventure();
      if(!canWalk(position,obstacles)){position={x:0,z:2};actor.position.set(0,.04,2);}
    }
    refreshMarkers();host.classList.toggle('is-arranging',arranging);
    const found=new Set(getAdventure(game).foundIds);host.dataset.secretsFound=String(found.size);
    for(const {label,secret} of secretLabels){label.classList.toggle('is-found',found.has(secret.id));label.textContent=found.has(secret.id)?`✓ ${secret.name}`:'✧ 看看这里';}
    for(const object of adventureWorld.children)if(object.userData.secretId)object.userData.discovered=found.has(object.userData.secretId);
    if(arranging){stopAdventure();destination.visible=false;say(selected?'点击草地上的圆环放置摆设':'从背包选择要布置的摆设');}
  }
  function setPaused(value){paused=Boolean(value);keyboard.clear();if(paused){stopAdventure();destination.visible=false;}else nextRoam=elapsed+2;host.dataset.paused=String(paused);}
  function control(action){
    if(action==='home'){fitCamera();say('已回到全景视角');}
    if(action==='near'){camera.position.sub(controls.target).multiplyScalar(.8).add(controls.target);controls.update();}
    if(action==='far'){camera.position.sub(controls.target).multiplyScalar(1.25).add(controls.target);controls.update();}
    if(action==='follow'){following=!following;host.querySelector('[data-scene-control="follow"]').setAttribute('aria-pressed',String(following));if(following){controls.target.set(position.x,1,position.z);camera.position.copy(controls.target).add(new THREE.Vector3(7,9,12));}say(following?'跟随考拉 · 点击草地继续走动':'自由视角');}
    if(action==='roam'){stopAdventure();setRoaming(!roam);nextRoam=elapsed+.5;say(roam?'自动散步已开启':'散步已暂停，仍可点击草地移动');}
    if(action==='stop-trail'){stopAdventure();destination.visible=false;nextRoam=elapsed+10;say('跑步已结束，随时可以再出发。');}
    if(action==='expand'){document.querySelector('.app-shell').classList.toggle('park-expanded');host.querySelector('[data-scene-control="expand"]').textContent=document.querySelector('.app-shell').classList.contains('park-expanded')?'收起场景':'展开场景';resize();}
    if(action==='retry'){if(!model)void loadModel();}
  }
  on(host,'click',event=>{const garden=event.target.closest('[data-scene-garden]');if(garden){visitGardenBed(garden.dataset.sceneGarden);return;}const secret=event.target.closest('[data-scene-secret]');if(secret){visitSecret(secret.dataset.sceneSecret);return;}const npc=event.target.closest('[data-scene-npc]');if(npc){stopAdventure();callbacks.onNpc?.(npc.dataset.sceneNpc);return;}const button=event.target.closest('[data-scene-control]');if(button)control(button.dataset.sceneControl);});
  on(canvas,'pointerdown',event=>{pointerDown={x:event.clientX,y:event.clientY,button:event.button};dragged=false;});
  on(canvas,'pointermove',event=>{if(pointerDown&&Math.hypot(event.clientX-pointerDown.x,event.clientY-pointerDown.y)>6)dragged=true;});
  on(canvas,'pointercancel',()=>{pointerDown=null;});
  on(canvas,'pointerup',event=>{
    if(!pointerDown||pointerDown.button!==0||dragged){pointerDown=null;return;}pointerDown=null;
    if(paused)return;
    const box=canvas.getBoundingClientRect();pointer.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);raycaster.setFromCamera(pointer,camera);
    if(!arranging){
      let bed=raycaster.intersectObjects(gardenWorld.children,true).find(hit=>{
        let object=hit.object;while(object&&!object.userData.gardenBedId)object=object.parent;return Boolean(object?.userData.gardenBedId);
      })?.object;
      while(bed&&!bed.userData.gardenBedId)bed=bed.parent;
      if(bed?.userData.gardenBedId){visitGardenBed(bed.userData.gardenBedId);return;}
      let secret=raycaster.intersectObjects(adventureWorld.children,true).find(hit=>{
        let object=hit.object;while(object&&!object.userData.secretId)object=object.parent;return Boolean(object?.userData.secretId);
      })?.object;
      while(secret&&!secret.userData.secretId)secret=secret.parent;
      if(secret?.userData.secretId){visitSecret(secret.userData.secretId);return;}
      stopAdventure();
      let resident=raycaster.intersectObjects(residents.children,true)[0]?.object;
      while(resident&&!resident.userData.npcId)resident=resident.parent;
      if(resident?.userData.npcId){callbacks.onNpc?.(resident.userData.npcId);return;}
      let hit=raycaster.intersectObjects(props.children,true)[0]?.object;
      while(hit&&!hit.userData.toyId)hit=hit.parent;
      if(hit?.userData.toyId){callbacks.onToy(hit.userData.toyId);return;}
      const shopBox=new THREE.Box3(new THREE.Vector3(5.8,0,-8.1),new THREE.Vector3(11.8,3.6,-3.8));
      if(raycaster.ray.intersectsBox(shopBox)){callbacks.onShop();return;}
    }
    const point=raycaster.ray.intersectPlane(ground,new THREE.Vector3());if(!point)return;
    if(arranging){
      const nearest=Object.entries(SLOT_POSITIONS).find(([,p])=>Math.hypot(p.x-point.x,p.z-point.z)<1.5);
      if(nearest&&selected)callbacks.onSlot(nearest[0]);else say('请先选中摆设，再点击草地上的圆环');return;
    }
    if(Math.abs(point.x-8.8)<3&&Math.abs(point.z+6)<2.5){callbacks.onShop();return;}
    canvas.focus({preventScroll:true});goTo({x:point.x,z:point.z});
  });
  const keyDirections={ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]};
  on(canvas,'keydown',event=>{if(paused)return;if(keyDirections[event.key]){event.preventDefault();stopAdventure();keyboard.add(event.key);destination.visible=false;nextRoam=elapsed+12;}if(event.code==='Space'){event.preventDefault();control('roam');}});
  on(canvas,'keyup',event=>keyboard.delete(event.key));on(canvas,'blur',()=>keyboard.clear());
  on(document,'visibilitychange',()=>{lastTime=0;keyboard.clear();});
  on(canvas,'webglcontextlost',event=>{event.preventDefault();contextLost=true;loading.hidden=false;loading.textContent='图形连接已中断，请切回书架后重新打开乐园。';host.classList.add('scene-failed');});
  function tick(time){
    if(disposed)return;frame=requestAnimationFrame(tick);
    const dt=lastTime?Math.min((time-lastTime)/1000,.06):0;lastTime=time;
    if(document.hidden||contextLost)return;
    elapsed+=dt;
    let moving=false, before={...position};
    if(model&&!arranging&&!paused){
      if(keyboard.size){let x=0,z=0;for(const key of keyboard){x+=keyDirections[key][0];z+=keyDirections[key][1];}const n=Math.hypot(x,z);if(n){const next={x:position.x+x/n*dt*2.6,z:position.z+z/n*dt*2.6};if(clearSegment(position,next,obstacles))position=next;}}
      else if(path.length){const next=advanceWalk(position,path,dt*(trailRunning?4.5:2.6));if(clearSegment(position,next.position,obstacles)){position=next.position;path=next.path;if(!path.length){markerFade=elapsed+1.5;nextRoam=Math.max(nextRoam,elapsed+3);arrived();}}else{stopAdventure();say('前面有障碍，请重新选择一条路。');}}
      else if(roam&&!trailRunning&&!gardenFocus&&!gardenBusy&&!secretBusy.size&&elapsed>nextRoam){nextRoam=elapsed+5;for(let i=0;i<20;i++){const target={x:(Math.random()-.5)*PARK_SIZE.x*1.65,z:(Math.random()-.5)*PARK_SIZE.z*1.6};if(canWalk(target,obstacles)&&Math.hypot(target.x-position.x,target.z-position.z)>3){goTo(target,false);break;}}}
      moving=Math.hypot(position.x-before.x,position.z-before.z)>.00001;
      if(moving&&!gardenFocus){const targetYaw=Math.atan2(position.x-before.x,position.z-before.z);yaw+=Math.atan2(Math.sin(targetYaw-yaw),Math.cos(targetYaw-yaw))*Math.min(1,dt*10);}
    }
    gait.amount.value=THREE.MathUtils.damp(gait.amount.value,moving?1:0,10,dt);gait.time.value=elapsed*(trailRunning?1.3:1);
    actor.position.set(position.x,.04+Math.abs(Math.sin(elapsed*9))*.045*gait.amount.value,position.z);actor.rotation.y=yaw;
    actorShadow.position.set(position.x,.027,position.z);
    if(model)model.rotation.z=Math.sin(elapsed*9)*.025*gait.amount.value;
    if(destination.visible){destination.scale.setScalar(1+Math.sin(elapsed*4)*.12);if(markerFade&&elapsed>markerFade)destination.visible=false;}
    if(following){const shift=new THREE.Vector3(position.x-controls.target.x,0,position.z-controls.target.z).multiplyScalar(Math.min(1,dt*4));controls.target.add(shift);camera.position.add(shift);}
    animateParkNpcs(residents,elapsed);
    animateAdventureWorld(adventureWorld,elapsed);
    animateGardenWorld(gardenWorld,elapsed,Date.now(),reducedMotion.matches);
    controls.update();renderer.render(scene,camera);
    const labelPosition=new THREE.Vector3();
    for(const {label,npc} of npcLabels){
      labelPosition.set(npc.position.x,npc.id==='rabbit-guide'?3:2.65,npc.position.z).project(camera);
      label.hidden=arranging||labelPosition.z>1||labelPosition.z< -1||Math.abs(labelPosition.x)>1||Math.abs(labelPosition.y)>1;
      label.style.transform=`translate(${(labelPosition.x+1)*host.clientWidth/2}px,${(1-labelPosition.y)*host.clientHeight/2}px) translate(-50%,-100%)`;
    }
    for(const {label,secret} of secretLabels){
      labelPosition.set(secret.position.x,secret.id==='trail-start'?3.4:2.4,secret.position.z).project(camera);
      const near=Math.hypot(position.x-secret.approach.x,position.z-secret.approach.z)<4;
      label.hidden=arranging||paused||!near||labelPosition.z>1||labelPosition.z< -1||Math.abs(labelPosition.x)>1||Math.abs(labelPosition.y)>1;
      label.style.transform=`translate(${(labelPosition.x+1)*host.clientWidth/2}px,${(1-labelPosition.y)*host.clientHeight/2}px) translate(-50%,-100%)`;
    }
    for(const {label,bed} of gardenLabels){
      labelPosition.set(bed.position.x,1.6,bed.position.z).project(camera);
      const near=Math.hypot(position.x-bed.approach.x,position.z-bed.approach.z)<1.1;
      label.hidden=arranging||paused||!near||labelPosition.z>1||labelPosition.z< -1||Math.abs(labelPosition.x)>1||Math.abs(labelPosition.y)>1;
      label.style.transform=`translate(${(labelPosition.x+1)*host.clientWidth/2}px,${(1-labelPosition.y)*host.clientHeight/2}px) translate(-50%,-100%)`;
    }
    labelPosition.set(GARDEN_ENTRANCE.x,.5,GARDEN_ENTRANCE.z).project(camera);
    gardenEntry.hidden=arranging||paused||Boolean(gardenFocus)||labelPosition.z>1||labelPosition.z< -1||Math.abs(labelPosition.x)>1||Math.abs(labelPosition.y)>1;
    gardenEntry.style.transform=`translate(${(labelPosition.x+1)*host.clientWidth/2}px,${(1-labelPosition.y)*host.clientHeight/2}px) translate(-50%,-100%)`;
    if(elapsed-lastAnnounce>.2){lastAnnounce=elapsed;canvas.dataset.koalaX=position.x.toFixed(3);canvas.dataset.koalaZ=position.z.toFixed(3);canvas.dataset.moving=String(moving);canvas.dataset.cameraDistance=controls.getDistance().toFixed(2);}
  }
  frame=requestAnimationFrame(tick);
  return {update,control,setPaused,visitSecret,startTrailRun,visitGardenBed,cancelGardenVisit,waterGarden,dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();for(const off of listeners)off();for(const {label} of [...npcLabels,...secretLabels,...gardenLabels])label.remove();gardenEntry.remove();controls.dispose();disposeTree(scene);renderer.dispose();renderer.forceContextLoss();document.querySelector('.app-shell')?.classList.remove('park-expanded');}};
}
