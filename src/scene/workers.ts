import * as THREE from 'three';

type CrewRoute = { x: number; z: number; yaw: number; distance: number };
type WorkYard = { x: number; z: number; yaw: number };
type WorkerRole = 'pull' | 'carry' | 'cut' | 'tend' | 'rest';

// An illustration of worksite organisation, not a claim about historical headcount.
// Every route stays outside the excavation; the front keeps a clear close-up yard.
const HAUL_ROUTES: CrewRoute[] = [
  { x: -10, z: 15.1, yaw: Math.PI / 2, distance: 4.8 },
  { x: -3.5, z: 15.8, yaw: Math.PI / 2, distance: 4.2 },
  { x: 5, z: 15.1, yaw: Math.PI / 2, distance: 4 },
  { x: 15.5, z: -10, yaw: 0, distance: 5 },
  { x: 16.4, z: 2, yaw: 0, distance: 5 },
  { x: -15.5, z: -9, yaw: 0, distance: 4 },
  { x: -16.4, z: 3, yaw: 0, distance: 4 },
  { x: -3, z: -15.5, yaw: Math.PI / 2, distance: 5 },
];
const CARRY_ROUTES = [
  { x: -10, z: 19.5, radiusX: 1.4, radiusZ: 0.6 },
  { x: 10, z: 19.5, radiusX: 1.4, radiusZ: 0.6 },
  { x: 20, z: 6, radiusX: 0.65, radiusZ: 3 },
  { x: 5, z: -18, radiusX: 3, radiusZ: 0.65 },
];
const WORK_YARDS: WorkYard[] = [
  { x: 3, z: 17.2, yaw: 0 },
  { x: -6.2, z: 17.2, yaw: 0 },
  { x: 18.8, z: -7, yaw: Math.PI / 2 },
  { x: -18.8, z: -6, yaw: -Math.PI / 2 },
];
const SHELTERS: WorkYard[] = [
  { x: -7, z: 22, yaw: 0 },
  { x: 8, z: 22, yaw: 0 },
  { x: 22, z: -2, yaw: Math.PI / 2 },
  { x: -22, z: 3, yaw: -Math.PI / 2 },
];

/** Instanced work crews and supply yards sampled from the construction timeline. */
export function buildConstructionWorkers() {
  const group = new THREE.Group();
  group.name = '金字塔建造工队';
  group.position.y = -0.32;
  const pullers = HAUL_ROUTES.length * 12;
  const carriers = CARRY_ROUTES.length * 16;
  const masons = WORK_YARDS.length * 8;
  const support = SHELTERS.length * 6;
  const people = pullers + carriers + masons + support;
  const materials: THREE.MeshStandardMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const batches: THREE.InstancedMesh[] = [];
  const movingBatches: THREE.InstancedMesh[] = [];
  const material = (color: number, roughness = 0.95) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness, transparent: true });
    materials.push(value);
    return value;
  };
  const skin = material(0x9e6343);
  const linen = material(0xe6d5b2);
  const timber = material(0x695038);
  const limestone = material(0xc9b990);
  const fiber = material(0x9c855a);
  const toolStone = material(0x665b4a);
  const canvas = material(0xcbbd94);
  const clay = material(0xb47b50);
  const vesselInterior = material(0x54432f);
  const trackMaterial = material(0xaf9b76);
  const batch = (name: string, geometry: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, count: number, moving = true) => {
    geometries.push(geometry);
    const mesh = new THREE.InstancedMesh(geometry, mat, count);
    mesh.name = name;
    mesh.instanceMatrix.setUsage(moving ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage);
    // A fixed set of batches avoids hundreds of per-person objects or moving bounds.
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    batches.push(mesh);
    if (moving) movingBatches.push(mesh);
    return mesh;
  };
  const torso = batch('工人躯干', new THREE.CylinderGeometry(0.026, 0.022, 0.074, 6), skin, people);
  torso.castShadow = true;
  const heads = batch('工人头部', new THREE.SphereGeometry(0.022, 8, 6), skin, people);
  const skirts = batch('亚麻裙布', new THREE.CylinderGeometry(0.025, 0.037, 0.047, 6), linen, people);
  const limbs = batch('工人四肢', new THREE.CylinderGeometry(1, 1, 1, 5), skin, people * 4);
  const wood = batch('雪橇木架与工具柄', new THREE.BoxGeometry(1, 1, 1), timber, HAUL_ROUTES.length * 3 + masons);
  const stones = batch('运输石块', new THREE.BoxGeometry(1, 1, 1), limestone, HAUL_ROUTES.length + carriers);
  const ropes = batch('拖石绳索', new THREE.CylinderGeometry(1, 1, 1, 5), fiber, HAUL_ROUTES.length * 2);
  const tools = batch('石工锤头', new THREE.BoxGeometry(1, 1, 1), toolStone, masons);
  const siteTimber = batch('棚架与木料架', new THREE.BoxGeometry(1, 1, 1), timber, SHELTERS.length * 7 + WORK_YARDS.length * 7, false);
  const stock = batch('石料堆场', new THREE.BoxGeometry(1, 1, 1), limestone, WORK_YARDS.length * 20, false);
  const awnings = batch('工地遮阳棚', new THREE.BoxGeometry(1, 1, 1), canvas, SHELTERS.length * 2, false);
  awnings.castShadow = true;
  const jars = batch('补给水罐', new THREE.CylinderGeometry(0.039, 0.047, 0.12, 8), clay, SHELTERS.length * 6, false);
  const jarRims = batch('水罐口', new THREE.TorusGeometry(0.031, 0.008, 4, 8), vesselInterior, SHELTERS.length * 6, false);
  const tracks = batch('雪橇运输车辙', new THREE.BoxGeometry(1, 1, 1), trackMaterial, HAUL_ROUTES.length * 2, false);

  const tint = new THREE.Color();
  for (let i = 0; i < people; i++) {
    tint.setScalar(0.84 + ((i * 7) % 11) * 0.025);
    torso.setColorAt(i, tint);
    heads.setColorAt(i, tint);
    for (let limb = 0; limb < 4; limb++) limbs.setColorAt(i * 4 + limb, tint);
    tint.setScalar(0.84 + (i % 5) * 0.04);
    skirts.setColorAt(i, tint);
  }
  for (let i = 0; i < stock.count; i++) {
    tint.setScalar(0.88 + ((i * 11) % 7) * 0.025);
    stock.setColorAt(i, tint);
  }

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const put = (mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, yaw = 0, pitch = 0) => {
    position.set(x, y, z);
    scale.set(sx, sy, sz);
    quaternion.setFromEuler(euler.set(pitch, yaw, 0));
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  };
  const localPoint = (out: THREE.Vector3, x: number, y: number, z: number, ox: number, oz: number, yaw: number) => {
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    return out.set(ox + x * cos + z * sin, y, oz - x * sin + z * cos);
  };
  const localPart = (mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, ox: number, oz: number, yaw: number, sx = 1, sy = 1, sz = 1, pitch = 0) => {
    localPoint(a, x, y, z, ox, oz, yaw);
    put(mesh, index, a.x, a.y, a.z, sx, sy, sz, yaw, pitch);
  };
  const segment = (mesh: THREE.InstancedMesh, index: number, ox: number, oz: number, yaw: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number) => {
    localPoint(a, ax, ay, az, ox, oz, yaw);
    localPoint(b, bx, by, bz, ox, oz, yaw);
    direction.subVectors(b, a);
    scale.set(radius, direction.length(), radius);
    quaternion.setFromUnitVectors(axis, direction.normalize());
    position.copy(a).add(b).multiplyScalar(0.5);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  };
  const posePerson = (index: number, x: number, z: number, yaw: number, phase: number, role: WorkerRole, toolIndex = -1) => {
    const working = role === 'cut';
    const seated = role === 'rest';
    const walking = role === 'pull' || role === 'carry';
    const stride = walking ? Math.sin(phase) * 0.029 : 0;
    const bob = walking ? Math.cos(phase * 2) * 0.002 : 0;
    const lean = role === 'pull' ? 0.18 : working ? 0.32 : 0.04;
    const drop = seated ? 0.045 : 0;
    localPart(torso, index, 0, 0.145 + bob - drop, 0.008, x, z, yaw, 1, 1, 1, lean);
    localPart(heads, index, 0, 0.207 + bob - drop - (working ? 0.012 : 0), lean * 0.07, x, z, yaw);
    localPart(skirts, index, 0, 0.1 + bob - drop, 0, x, z, yaw);
    for (let side = 0; side < 2; side++) {
      const sign = side ? 1 : -1;
      segment(limbs, index * 4 + side, x, z, yaw, sign * 0.018, 0.085 + bob - drop, 0, sign * 0.025, 0.012, seated ? 0.075 : sign * stride, 0.008);
      const lift = working && side === 1 ? (Math.sin(phase) + 1) * 0.037 : 0;
      const handY = (working ? 0.106 + lift : role === 'carry' ? 0.16 : role === 'tend' ? 0.135 : 0.118) - drop;
      const handZ = working ? 0.11 - lift * 0.7 : role === 'carry' ? 0.09 : 0.08;
      segment(limbs, index * 4 + side + 2, x, z, yaw, sign * 0.031, 0.165 + bob - drop, 0.014, sign * 0.036, handY + bob, handZ, 0.0065);
      if (working && side === 1 && toolIndex >= 0) {
        segment(wood, HAUL_ROUTES.length * 3 + toolIndex, x, z, yaw, 0.036, handY, handZ, 0.036, handY + 0.035, handZ + 0.028, 0.009);
        localPart(tools, toolIndex, 0.036, handY + 0.035, handZ + 0.028, x, z, yaw, 0.043, 0.02, 0.025, -0.4);
      }
    }
  };

  // Fixed props do not upload matrices during playback. Separate working lanes,
  // dressing yards, and supply shelters make the crowd legible from a wide view.
  for (const [yardIndex, yard] of WORK_YARDS.entries()) {
    for (let i = 0; i < 8; i++) {
      localPart(stock, yardIndex * 20 + i, (i % 4) * 0.7, 0.065, Math.floor(i / 4) * 0.7 + 0.19, yard.x, yard.z, yard.yaw, 0.22, 0.13, 0.2);
    }
    for (let i = 0; i < 12; i++) {
      localPart(stock, yardIndex * 20 + 8 + i, 2.85 + (i % 3) * 0.32, 0.085, Math.floor(i / 3) * 0.3, yard.x, yard.z, yard.yaw, 0.27, 0.17, 0.25);
    }
    const base = SHELTERS.length * 7 + yardIndex * 7;
    for (let i = 0; i < 2; i++) {
      localPart(siteTimber, base + i, 0.2 + i * 0.8, 0.06, 1.55, yard.x, yard.z, yard.yaw, 0.07, 0.12, 0.55);
    }
    for (let i = 0; i < 5; i++) {
      localPart(siteTimber, base + 2 + i, 0.6, 0.15 + Math.floor(i / 3) * 0.065, 1.4 + (i % 3) * 0.12, yard.x, yard.z, yard.yaw, 1.25, 0.06, 0.07);
    }
  }
  for (const [shelterIndex, shelter] of SHELTERS.entries()) {
    const base = shelterIndex * 7;
    for (let i = 0; i < 4; i++) {
      localPart(siteTimber, base + i, i % 2 ? 0.72 : -0.72, 0.24, i < 2 ? -0.44 : 0.44, shelter.x, shelter.z, shelter.yaw, 0.035, 0.48, 0.035);
    }
    localPart(siteTimber, base + 4, 0, 0.535, 0, shelter.x, shelter.z, shelter.yaw, 1.6, 0.035, 0.035);
    for (let side = 0; side < 2; side++) {
      localPart(siteTimber, base + 5 + side, side ? 0.72 : -0.72, 0.46, 0, shelter.x, shelter.z, shelter.yaw, 0.035, 0.035, 0.95);
      localPart(awnings, shelterIndex * 2 + side, 0, 0.51, side ? 0.25 : -0.25, shelter.x, shelter.z, shelter.yaw, 1.64, 0.012, 0.54, side ? 0.12 : -0.12);
    }
    for (let i = 0; i < 6; i++) {
      const x = 1.02 + (i % 2) * 0.13;
      const z = -0.25 + Math.floor(i / 2) * 0.15;
      localPart(jars, shelterIndex * 6 + i, x, 0.06, z, shelter.x, shelter.z, shelter.yaw);
      localPart(jarRims, shelterIndex * 6 + i, x, 0.12, z, shelter.x, shelter.z, shelter.yaw, 1, 1, 1, Math.PI / 2);
    }
  }
  for (const [index, route] of HAUL_ROUTES.entries()) {
    for (let side = 0; side < 2; side++) {
      localPart(tracks, index * 2 + side, side ? 0.105 : -0.105, 0.002, route.distance / 2 + 0.7, route.x, route.z, route.yaw, 0.022, 0.003, route.distance + 2.6);
    }
  }
  for (const mesh of batches) if (!movingBatches.includes(mesh)) mesh.instanceMatrix.needsUpdate = true;

  let lastProgress = -1;
  let disposed = false;
  const smooth = (value: number) => {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  // No independent clock: pause holds every pose and scrubbing is exactly reversible.
  const update = (progress: number, _playing: boolean, mode: string) => {
    if (disposed) return;
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const opacity = smooth((p - 0.025) / 0.025) * (1 - smooth((p - 0.84) / 0.04));
    group.visible = opacity > 0.001 && !['today', 'inside', 'interior'].includes(mode);
    for (const mat of materials) {
      mat.opacity = opacity;
      mat.depthWrite = opacity > 0.98;
    }
    if (p === lastProgress || (!group.visible && lastProgress >= 0)) return;
    lastProgress = p;
    const time = p * 24;
    for (const [crew, route] of HAUL_ROUTES.entries()) {
      const x = route.x + Math.sin(route.yaw) * p * route.distance;
      const z = route.z + Math.cos(route.yaw) * p * route.distance;
      const yaw = route.yaw;
      localPart(wood, crew * 3, -0.105, 0.017, 0, x, z, yaw, 0.035, 0.03, 0.58);
      localPart(wood, crew * 3 + 1, 0.105, 0.017, 0, x, z, yaw, 0.035, 0.03, 0.58);
      localPart(wood, crew * 3 + 2, 0, 0.048, 0, x, z, yaw, 0.27, 0.035, 0.46);
      localPart(stones, crew, 0, 0.155, 0, x, z, yaw, 0.25, 0.18, 0.3);
      for (let side = 0; side < 2; side++) {
        const offset = side ? 0.095 : -0.095;
        segment(ropes, crew * 2 + side, x, z, yaw, offset, 0.1, 0.17, offset, 0.118, 1.94, 0.004);
        for (let row = 0; row < 6; row++) {
          const index = crew * 12 + row * 2 + side;
          localPoint(a, side ? 0.14 : -0.14, 0, 0.42 + row * 0.29, x, z, yaw);
          posePerson(index, a.x, a.z, yaw, time * 9 + row * 0.7 + side * 0.4 + crew * 0.6, 'pull');
        }
      }
    }
    for (const [routeIndex, route] of CARRY_ROUTES.entries()) {
      for (let i = 0; i < 16; i++) {
        const index = routeIndex * 16 + i;
        const angle = (i / 16 + p * 0.32) * Math.PI * 2;
        const x = route.x + Math.cos(angle) * route.radiusX;
        const z = route.z + Math.sin(angle) * route.radiusZ;
        const yaw = Math.atan2(-Math.sin(angle) * route.radiusX, Math.cos(angle) * route.radiusZ);
        posePerson(pullers + index, x, z, yaw, time * 8 + index * 1.4, 'carry');
        localPart(stones, HAUL_ROUTES.length + index, 0, 0.163, 0.1, x, z, yaw, 0.12, 0.065, 0.085);
      }
    }
    for (const [yardIndex, yard] of WORK_YARDS.entries()) {
      for (let i = 0; i < 8; i++) {
        const index = yardIndex * 8 + i;
        localPoint(a, (i % 4) * 0.7, 0, Math.floor(i / 4) * 0.7, yard.x, yard.z, yard.yaw);
        posePerson(pullers + carriers + index, a.x, a.z, yard.yaw, time * 7 + index * 1.7, 'cut', index);
      }
    }
    for (const [shelterIndex, shelter] of SHELTERS.entries()) {
      for (let i = 0; i < 6; i++) {
        const seated = i < 2;
        localPoint(a, seated ? -0.45 + i * 0.55 : -0.48 + (i - 2) * 0.31, 0, seated ? -0.18 : 0.65, shelter.x, shelter.z, shelter.yaw);
        posePerson(pullers + carriers + masons + shelterIndex * 6 + i, a.x, a.z, shelter.yaw + (seated ? 0 : Math.PI), time + i, seated ? 'rest' : 'tend');
      }
    }
    for (const mesh of movingBatches) mesh.instanceMatrix.needsUpdate = true;
  };
  update(0, false, 'solid');

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const mesh of batches) mesh.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const mat of materials) mat.dispose();
    group.removeFromParent();
  };
  return { group, update, dispose };
}
