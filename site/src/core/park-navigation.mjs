import { PARK_NPCS } from './park-catalog.mjs';
import { ADVENTURE_OBSTACLES } from './park-adventure-rules.mjs';
import { GARDEN_OBSTACLES, GARDEN_PATH_POINTS } from './park-garden-rules.mjs';

export const PARK_SIZE = { x: 28, z: 21, clearance: 0.65 };
export const SLOT_POSITIONS = {
  'lawn-west': { x: -5, z: 3.5 },
  'lawn-east': { x: 5, z: 3.5 },
  'lawn-front-left': { x: -4, z: 8 },
  'lawn-front-right': { x: 4, z: 8 },
  'meadow-west': { x: -18, z: 6 },
  'meadow-east': { x: 19, z: 5 },
  'forest-northwest': { x: -18, z: -9 },
  'forest-north': { x: -9, z: -14 },
  'forest-northeast': { x: 3, z: -14 },
  'market-east': { x: 17, z: -7 },
  'garden-west': { x: -18, z: -1 },
  'garden-east': { x: 18, z: -1 },
  'southwest': { x: -12, z: 13 },
  'south': { x: -4, z: 15 },
  'southeast': { x: 5, z: 15 },
  'playground-east': { x: 14, z: 13 },
};
export const TREE_POSITIONS = [[-25,-3],[-24,-8],[-21,-12],[-15,-16],[-6,-19],[2,-19],[10,-17.5],[18,-14],[23,-9],[26,-2],[25,5],[21,11],[17,15],[-25,4],[-23,9],[-18,14],[-11,18],[9,18]];
export const FIXED_OBSTACLES = [
  ...ADVENTURE_OBSTACLES,
  ...GARDEN_OBSTACLES,
  { x: -8.7, z: -5.8, width: 7.6, depth: 6.2 },
  { x: 8.8, z: -6, width: 6, depth: 4.2 },
  { x: -12.4, z: 3.2, width: 3.6, depth: 2.8 },
  { x: 11.2, z: 6, radius: 1.7 },
  { x: 12, z: 1.7, width: 3.3, depth: 1.4 },
  { x: -20, z: 9.3, width: 3, depth: 1.6 },
  ...PARK_NPCS.map(({ position }) => ({ ...position, radius: 0.6 })),
  ...TREE_POSITIONS.map(([x,z]) => ({ x, z, radius: 0.55 })),
];

export function parkObstacles(placements = []) {
  return [...FIXED_OBSTACLES, ...placements.map((item) => SLOT_POSITIONS[item.slotId]).filter(Boolean).map((p) => ({ ...p, radius: 1.65 }))];
}

export function canWalk(point, obstacles = FIXED_OBSTACLES) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  const gap = PARK_SIZE.clearance;
  if ((point.x / (PARK_SIZE.x - gap)) ** 2 + (point.z / (PARK_SIZE.z - gap)) ** 2 > 1) return false;
  return !obstacles.some((o) => o.radius !== undefined
    ? Math.hypot(point.x - o.x, point.z - o.z) < o.radius + gap
    : Math.abs(point.x - o.x) < o.width / 2 + gap && Math.abs(point.z - o.z) < o.depth / 2 + gap);
}

export function clearSegment(a, b, obstacles = FIXED_OBSTACLES) {
  // 岛屿边界是凸椭圆，端点在岛内即可；障碍则精确检查，避免采样漏掉建筑角。
  if (!canWalk(a, obstacles) || !canWalk(b, obstacles)) return false;
  const dx = b.x - a.x, dz = b.z - a.z, lengthSquared = dx * dx + dz * dz;
  return !obstacles.some((o) => {
    if (o.radius !== undefined) {
      const t = lengthSquared ? Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.z - a.z) * dz) / lengthSquared)) : 0;
      return Math.hypot(a.x + dx * t - o.x, a.z + dz * t - o.z) < o.radius + PARK_SIZE.clearance;
    }
    let enter = 0, leave = 1;
    for (const [origin, delta, center, size] of [[a.x, dx, o.x, o.width], [a.z, dz, o.z, o.depth]]) {
      const half = size / 2 + PARK_SIZE.clearance;
      if (delta === 0) { if (Math.abs(origin - center) >= half) return false; continue; }
      const first = (center - half - origin) / delta, second = (center + half - origin) / delta;
      enter = Math.max(enter, Math.min(first, second));
      leave = Math.min(leave, Math.max(first, second));
      if (enter >= leave) return false;
    }
    return enter < leave;
  });
}

export function findWalkingPath(start, target, obstacles = FIXED_OBSTACLES) {
  if (!canWalk(start, obstacles) || !canWalk(target, obstacles)) return [];
  if (clearSegment(start, target, obstacles)) return [{ ...target }];
  const key = (p) => `${p.x}:${p.z}`;
  const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
  const nearGrid = (point) => {
    const points = [];
    for (let dx=-2; dx<=2; dx++) for (let dz=-2; dz<=2; dz++) {
      const p = { x: Math.round(point.x*2)/2+dx/2, z: Math.round(point.z*2)/2+dz/2 };
      if (clearSegment(point,p,obstacles)) points.push(p);
    }
    return points.sort((a,b) => distance(a,point)-distance(b,point))[0];
  };
  const first=nearGrid(start), last=nearGrid(target);
  if (!first || !last) return [];
  const nodes=new Map([[key(first), { ...first, cost:0, score:distance(first,last), parent:null }]]);
  const open=[key(first)], visited=new Set();
  let end;
  while (open.length && visited.size < 12000) {
    let best=0;
    for (let i=1;i<open.length;i++) if (nodes.get(open[i]).score < nodes.get(open[best]).score) best=i;
    const id=open.splice(best,1)[0], node=nodes.get(id);
    if (id===key(last)) { end=node; break; }
    visited.add(id);
    for (let dx=-1;dx<=1;dx++) for (let dz=-1;dz<=1;dz++) {
      if (!dx && !dz) continue;
      const next={ x:node.x+dx/2, z:node.z+dz/2 }, nextId=key(next);
      if (visited.has(nextId) || !clearSegment(node,next,obstacles)) continue;
      const cost=node.cost+Math.hypot(dx,dz)/2;
      if (!nodes.has(nextId) || cost<nodes.get(nextId).cost) {
        nodes.set(nextId,{...next,cost,score:cost+distance(next,last),parent:id});
        if (!open.includes(nextId)) open.push(nextId);
      }
    }
  }
  if (!end) return [];
  const raw=[{...target}];
  for (let n=end;n;n=nodes.get(n.parent)) raw.unshift({x:n.x,z:n.z});
  const result=[];
  let from=start, i=0;
  while (i<raw.length) {
    let furthest=i;
    for (let j=i+1;j<raw.length;j++) if (clearSegment(from,raw[j],obstacles)) furthest=j;
    result.push(raw[furthest]); from=raw[furthest]; i=furthest+1;
  }
  return result;
}

export function advanceWalk(position, path, distance) {
  let current={...position}, remaining=Math.max(0,Number.isFinite(distance)?distance:0), index=0;
  while (index<path.length) {
    const target=path[index], length=Math.hypot(target.x-current.x,target.z-current.z);
    if (length<=remaining) { current={...target}; remaining-=length; index++; }
    else {
      if (length>0) { current.x+=(target.x-current.x)*remaining/length; current.z+=(target.z-current.z)*remaining/length; }
      break;
    }
  }
  return { position:current, path:path.slice(index), arrived:index===path.length };
}

// 照料行程保留石径拐点；通用寻路的直线简化会让角色切过弯道。
export function findGardenWalkingPath(start, target, obstacles = FIXED_OBSTACLES) {
  if (!canWalk(start, obstacles) || !canWalk(target, obstacles)) return [];
  const targetIndex = GARDEN_PATH_POINTS.findIndex((point) => Math.hypot(point.x - target.x, point.z - target.z) < .001);
  if (targetIndex < 0) return [];
  let startIndex = 0;
  for (let i = 1; i < GARDEN_PATH_POINTS.length; i++) {
    const distance = (point) => Math.hypot(point.x - start.x, point.z - start.z);
    if (distance(GARDEN_PATH_POINTS[i]) < distance(GARDEN_PATH_POINTS[startIndex])) startIndex = i;
  }
  const path = findWalkingPath(start, GARDEN_PATH_POINTS[startIndex], obstacles);
  if (!path.length) return [];
  const direction = Math.sign(targetIndex - startIndex);
  for (let i = startIndex; i !== targetIndex; i += direction) {
    const next = GARDEN_PATH_POINTS[i + direction];
    if (!clearSegment(GARDEN_PATH_POINTS[i], next, obstacles)) return [];
    path.push({ ...next });
  }
  return path;
}
