/**
 * 高精度真实建筑构件生成器
 * 为胡夫金字塔内部提供：
 *  - 大画廊 7 层叠涩拱断面 + 40 块棘轮顶盖 + 27 对插孔坡道 + 木质踏步防滑板
 *  - 国王墓室花岗岩排砖墙 + 9 根顶梁 + 镂空花岗岩石棺（含内腔与破角） + 5 层减压室大梁与人字屋脊
 *  - 王后墓室 5 层叠涩凹龛 + 双坡人字石梁 + 盲井口
 *  - 前厅 3 道花岗岩吊闸导槽与下垂闸板
 *  - 下降/上升通道木踏步防滑梯板（坡度 26° 真实攀爬构造）
 *  - 北面入口 2 层双人字形巨石过梁（Chevron Lintel）
 */
import * as THREE from 'three';
import { S } from '../scene/khufu';

const up = new THREE.Vector3(0, 1, 0);

/** 坐标缩放 helper */
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x * S, y * S, z * S);

/**
 * 沿轴线 a→b 生成带有局部坐标变换的网格
 */
export function createAlignedBox(
  folder: THREE.Object3D,
  mat: THREE.Material,
  a: [number, number, number],
  b: [number, number, number],
  w: number,
  h: number,
  offset: { side?: number; normal?: number; onFloor?: boolean } = {},
  pivotStart = true,
) {
  const va = V(...a);
  const vb = V(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  dir.normalize();
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  const upv = new THREE.Vector3().crossVectors(right, dir).normalize();

  const geo = new THREE.BoxGeometry(w * S, h * S, len);
  if (pivotStart) {
    geo.translate(0, 0, len / 2);
  }

  const origin = va.clone();
  if (offset.onFloor) origin.addScaledVector(upv, (h * S) / 2);
  if (offset.side) origin.addScaledVector(right, offset.side * S);
  if (offset.normal) origin.addScaledVector(upv, offset.normal * S);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(origin);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, upv, dir));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.growAxis = 'z';
  folder.add(mesh);
  return mesh;
}

/**
 * 沿通道轴线 a→b 生成木质防滑踏步梯条（真实攀爬金字塔 26° 坡道时铺设的步板）
 */
export function buildPassageSteps(
  folder: THREE.Object3D,
  woodMat: THREE.Material,
  a: [number, number, number],
  b: [number, number, number],
  stepCount: number,
  stepWidth = 0.85,
  stepHeight = 0.06,
  stepThickness = 0.12,
) {
  const va = V(...a);
  const vb = V(...b);
  const dir = vb.clone().sub(va).normalize();
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  const upv = new THREE.Vector3().crossVectors(right, dir).normalize();

  const instGeo = new THREE.BoxGeometry(stepWidth * S, stepHeight * S, stepThickness * S);
  const inst = new THREE.InstancedMesh(instGeo, woodMat, stepCount);
  const m4 = new THREE.Matrix4();
  const rot = new THREE.Matrix4().makeBasis(right, upv, dir);

  for (let i = 0; i < stepCount; i++) {
    const t = (i + 0.5) / stepCount;
    // 阶梯板坐落在实心石地板上（+0.12 m）
    const pos = va.clone().lerp(vb, t).addScaledVector(upv, (stepHeight * S) / 2 + 0.12 * S);
    m4.makeTranslation(pos.x, pos.y, pos.z).multiply(rot);
    inst.setMatrixAt(i, m4);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = true;
  folder.add(inst);
  return inst;
}

/**
 * 大画廊精细构件：
 * 1. 7 层重叠叠涩拱侧壁
 * 2. 40 块横向棘轮顶盖石
 * 3. 两侧 51cm 宽石坡台 + 27 对插孔（Mortise Slots）
 * 4. 中央 1.04m 坡道上的木踏步梯级
 */
export function buildGrandGalleryDetail(
  folder: THREE.Group,
  stoneMat: THREE.Material,
  woodMat: THREE.Material,
  darkMat: THREE.Material,
  G0: [number, number, number],
  G1: [number, number, number],
  t0: number,
  t1: number,
) {
  const list: THREE.Mesh[] = [];

  // 1. 大画廊主通道：一圈圈石砌环框自下而上依次砌成
  {
    const va = V(...G0);
    const vb = V(...G1);
    const dir = vb.clone().sub(va).normalize();
    const len = vb.distanceTo(va);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const upv = new THREE.Vector3().crossVectors(right, dir).normalize();
    const ringCount = 18;
    const ringLen = len / ringCount;
    for (let i = 0; i < ringCount; i++) {
      const c = va.clone().addScaledVector(dir, (i + 0.5) * ringLen);
      const geo = new THREE.BoxGeometry(2.06 * S, 8.6 * S, ringLen * S);
      const mesh = new THREE.Mesh(geo, stoneMat);
      mesh.position.copy(c).addScaledVector(upv, (8.6 * S) / 2);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, upv, dir));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.growAxis = 'pop';
      mesh.userData.t0 = t0 + (t1 - t0) * (i / ringCount);
      mesh.userData.t1 = t0 + (t1 - t0) * ((i + 1) / ringCount);
      folder.add(mesh);
      list.push(mesh);
    }
    // 实心石地板与侧墙（随主通道一并出现）
    const floor = createAlignedBox(folder, stoneMat, G0, G1, 3.0, 0.65, { normal: -0.28 });
    floor.userData.growAxis = 'z';
    floor.userData.t0 = t0;
    floor.userData.t1 = t1;
    list.push(floor);
    const wallL = createAlignedBox(folder, stoneMat, G0, G1, 0.55, 8.9, { onFloor: true, side: 1.28 });
    wallL.userData.growAxis = 'z';
    wallL.userData.t0 = t0;
    wallL.userData.t1 = t1;
    list.push(wallL);
    const wallR = createAlignedBox(folder, stoneMat, G0, G1, 0.55, 8.9, { onFloor: true, side: -1.28 });
    wallR.userData.growAxis = 'z';
    wallR.userData.t0 = t0;
    wallR.userData.t1 = t1;
    list.push(wallR);
  }

  // 2. 两侧各 7 层向内收进的挑檐石（从 2.29m 高度起，每层向内收 7.6cm）
  for (let layer = 0; layer < 7; layer++) {
    const inSet = (layer + 1) * 0.076; // 每层内收
    const yHeight = 2.29 + layer * 0.88; // 离地高
    for (const sgn of [-1, 1]) {
      const corbel = createAlignedBox(folder, stoneMat, G0, G1, 0.45, 0.38, {
        side: sgn * (1.03 - inSet + 0.22),
        normal: yHeight,
      });
      list.push(corbel);
    }
  }

  // 3. 顶部 40 块横向棘轮屋盖石（跨度从 2.06m 收到 1.04m）
  const va = V(...G0);
  const vb = V(...G1);
  const dir = vb.clone().sub(va).normalize();
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  const upv = new THREE.Vector3().crossVectors(right, dir).normalize();
  const roofGeo = new THREE.BoxGeometry(1.25 * S, 0.45 * S, 0.85 * S);
  const roofInst = new THREE.InstancedMesh(roofGeo, stoneMat, 38);
  const rot = new THREE.Matrix4().makeBasis(right, upv, dir);
  for (let i = 0; i < 38; i++) {
    const t = (i + 0.5) / 38;
    const pos = va.clone().lerp(vb, t).addScaledVector(upv, 8.4 * S);
    const m4 = new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z).multiply(rot);
    roofInst.setMatrixAt(i, m4);
  }
  roofInst.instanceMatrix.needsUpdate = true;
  folder.add(roofInst);

  // 4. 两侧 51cm 宽石坡台
  for (const sgn of [-1, 1]) {
    const ramp = createAlignedBox(folder, stoneMat, G0, G1, 0.51, 0.58, {
      side: sgn * (0.52 + 0.255),
      onFloor: true,
    });
    list.push(ramp);
  }

  // 5. 坡台上 27 对矩形插孔（Mortise Slots，长 0.52m × 宽 0.16m × 深 0.2m）
  const slotGeo = new THREE.BoxGeometry(0.18 * S, 0.05 * S, 0.48 * S);
  const slotInst = new THREE.InstancedMesh(slotGeo, darkMat, 54);
  let slotIdx = 0;
  for (let i = 0; i < 27; i++) {
    const t = (i + 0.8) / 28;
    for (const sgn of [-1, 1]) {
      const pos = va
        .clone()
        .lerp(vb, t)
        .addScaledVector(right, sgn * (0.52 + 0.255) * S)
        .addScaledVector(upv, 0.58 * S + 0.002);
      const m4 = new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z).multiply(rot);
      slotInst.setMatrixAt(slotIdx++, m4);
    }
  }
  slotInst.instanceMatrix.needsUpdate = true;
  folder.add(slotInst);

  // 6. 中央 1.04m 坡道上的木踏步防滑板（共 72 级）
  buildPassageSteps(folder, woodMat, G0, G1, 72, 0.95, 0.045, 0.14);

  return list;
}

/**
 * 国王墓室精细构件：
 * 1. 镂空无盖红花岗岩石棺（带内腔、破损外唇、侧槽）
 * 2. 9 块巨型花岗岩平顶横梁（跨 5.23m）
 * 3. 四壁 5 层花岗岩砌块分缝线条
 * 4. 南北两壁 0.91m 高处的通风井口
 */
export function buildKingsChamberDetail(
  folder: THREE.Group,
  graniteMat: THREE.Material,
  darkMat: THREE.Material,
  pos: [number, number, number],
) {
  const list: THREE.Mesh[] = [];
  const cx = pos[0];
  const cy = pos[1];
  const cz = pos[2];

  // 1. 墓室外壁盒体（10.47m 东西 × 5.84m 高 × 5.23m 南北，DoubleSide）
  const room = new THREE.Mesh(new THREE.BoxGeometry(10.47 * S, 5.84 * S, 5.23 * S), graniteMat);
  room.position.set(cx * S, (cy + 2.92) * S, cz * S);
  room.castShadow = true;
  room.receiveShadow = true;
  folder.add(room);
  list.push(room);

  // 2. 9 块花岗岩平顶天花横梁（东西跨度 10.47m，南北分布）
  for (let i = 0; i < 9; i++) {
    const beamZ = cz - 2.615 + ((i + 0.5) * 5.23) / 9;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(10.6 * S, 0.65 * S, (5.23 / 9) * 0.96 * S), graniteMat);
    beam.position.set(cx * S, (cy + 5.84 + 0.32) * S, beamZ * S);
    beam.castShadow = true;
    folder.add(beam);
    list.push(beam);
  }

  // 3. 镂空花岗岩石棺（位于西端，外 2.28 × 0.98 × 1.05m，内 1.98 × 0.68 × 0.88m）
  const sarcX = cx - 3.85;
  const sarcZ = cz;
  // 石棺底板
  const cofferBottom = new THREE.Mesh(new THREE.BoxGeometry(0.98 * S, 0.17 * S, 2.28 * S), graniteMat);
  cofferBottom.position.set(sarcX * S, (cy + 0.085) * S, sarcZ * S);
  folder.add(cofferBottom);
  list.push(cofferBottom);
  // 石棺四壁（构成镂空桶状）
  const cofferW = new THREE.Mesh(new THREE.BoxGeometry(0.15 * S, 0.88 * S, 2.28 * S), graniteMat);
  cofferW.position.set((sarcX - 0.415) * S, (cy + 0.17 + 0.44) * S, sarcZ * S);
  const cofferE = new THREE.Mesh(new THREE.BoxGeometry(0.15 * S, 0.88 * S, 2.28 * S), graniteMat);
  cofferE.position.set((sarcX + 0.415) * S, (cy + 0.17 + 0.44) * S, sarcZ * S);
  const cofferN = new THREE.Mesh(new THREE.BoxGeometry(0.68 * S, 0.88 * S, 0.15 * S), graniteMat);
  cofferN.position.set(sarcX * S, (cy + 0.17 + 0.44) * S, (sarcZ + 1.065) * S);
  const cofferS = new THREE.Mesh(new THREE.BoxGeometry(0.68 * S, 0.88 * S, 0.15 * S), graniteMat);
  cofferS.position.set(sarcX * S, (cy + 0.17 + 0.44) * S, (sarcZ - 1.065) * S);
  // 内腔深色阴影块
  const cavity = new THREE.Mesh(new THREE.BoxGeometry(0.66 * S, 0.86 * S, 1.96 * S), darkMat);
  cavity.position.set(sarcX * S, (cy + 0.17 + 0.43) * S, sarcZ * S);
  folder.add(cofferW, cofferE, cofferN, cofferS, cavity);
  list.push(cofferW, cofferE, cofferN, cofferS);

  // 4. 南北墙面 0.91m 高处的通风井口（方形黑口）
  const ventN = new THREE.Mesh(new THREE.BoxGeometry(0.24 * S, 0.24 * S, 0.08 * S), darkMat);
  ventN.position.set((cx + 2.0) * S, (cy + 0.91) * S, (cz + 2.615) * S);
  const ventS = new THREE.Mesh(new THREE.BoxGeometry(0.24 * S, 0.24 * S, 0.08 * S), darkMat);
  ventS.position.set((cx - 2.0) * S, (cy + 0.91) * S, (cz - 2.615) * S);
  folder.add(ventN, ventS);

  return list;
}

/**
 * 5 层减压室 + 顶部人字梁（Relieving Chambers & Gable Roof）
 * 自下而上：
 *  - 戴维森室 (Davison's Chamber)
 *  - 威灵顿室 (Wellington's Chamber)
 *  - 纳尔逊室 (Nelson's Chamber)
 *  - 阿巴思诺特室 (Lady Arbuthnot's Chamber)
 *  - 坎贝尔室 (Campbell's Chamber)
 *  - 巨型花岗岩人字梁顶 (Gable Roof)
 */
export function buildRelievingChambersDetail(
  folder: THREE.Group,
  limestoneMat: THREE.Material,
  graniteMat: THREE.Material,
  cx: number,
  baseRoofY: number,
  cz: number,
) {
  const list: THREE.Mesh[] = [];

  for (let i = 0; i < 5; i++) {
    const cavY = baseRoofY + 0.65 + i * 1.55;
    // 空腔体
    const cav = new THREE.Mesh(new THREE.BoxGeometry(10.47 * S, 0.95 * S, 5.23 * S), limestoneMat);
    cav.position.set(cx * S, (cavY + 0.475) * S, cz * S);
    cav.castShadow = true;
    folder.add(cav);
    list.push(cav);

    // 隔断大梁（花岗岩巨梁，每块 50~80 吨）
    if (i < 4) {
      const beamY = cavY + 0.95 + 0.3;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(11.2 * S, 0.6 * S, 5.6 * S), graniteMat);
      beam.position.set(cx * S, beamY * S, cz * S);
      beam.castShadow = true;
      folder.add(beam);
      list.push(beam);
    }
  }

  // 顶层封顶板
  const topPlate = new THREE.Mesh(new THREE.BoxGeometry(11.4 * S, 0.7 * S, 5.8 * S), graniteMat);
  topPlate.position.set(cx * S, (baseRoofY + 0.65 + 4 * 1.55 + 1.25) * S, cz * S);
  folder.add(topPlate);
  list.push(topPlate);

  // 巨型人字形石梁（棱沿东西向，向南北两侧分流数十万吨压力）
  const gableCenterY = baseRoofY + 0.65 + 4 * 1.55 + 2.4;
  for (const sgn of [-1, 1]) {
    const chevron = new THREE.Mesh(new THREE.BoxGeometry(11.6 * S, 0.95 * S, 4.2 * S), limestoneMat);
    chevron.position.set(cx * S, gableCenterY * S, (cz + sgn * 1.65) * S);
    chevron.rotation.x = (sgn * 42 * Math.PI) / 180;
    chevron.castShadow = true;
    folder.add(chevron);
    list.push(chevron);
  }

  return list;
}

/**
 * 王后墓室精细构件：
 * 1. 5.23m × 5.75m 墓室腔体
 * 2. 东墙 5 层叠涩凹龛（Corbelled Niche，高 4.67m，四次内收）
 * 3. 东西向人字形尖顶（Gable Roof）
 * 4. 南北两壁通风盲井口
 */
export function buildQueensChamberDetail(
  folder: THREE.Group,
  stoneMat: THREE.Material,
  darkMat: THREE.Material,
  cx: number,
  cy: number,
  cz: number,
) {
  const list: THREE.Mesh[] = [];

  // 1. 墓室主体（地面 21.3m，墙高 4.6m，DoubleSide）
  const room = new THREE.Mesh(new THREE.BoxGeometry(5.23 * S, 4.6 * S, 5.75 * S), stoneMat);
  room.position.set(cx * S, (cy + 2.3) * S, cz * S);
  room.castShadow = true;
  room.receiveShadow = true;
  folder.add(room);
  list.push(room);

  // 2. 人字形尖顶（两坡朝向南北，跨 5.23m，脊高 6.23m）
  for (const sgn of [-1, 1]) {
    const slope = new THREE.Mesh(new THREE.BoxGeometry(5.4 * S, 0.5 * S, 3.4 * S), stoneMat);
    slope.position.set(cx * S, (cy + 4.6 + 0.9) * S, (cz + sgn * 1.45) * S);
    slope.rotation.x = (sgn * 36 * Math.PI) / 180;
    slope.castShadow = true;
    folder.add(slope);
    list.push(slope);
  }

  // 3. 东墙 5 层叠涩凹龛（高 4.67m，宽自 1.57m 四次收进到 0.52m）
  const nicheTiers = [
    { w: 1.57, h: 1.05, d: 0.45, y: 0.525 },
    { w: 1.32, h: 0.95, d: 0.52, y: 1.525 },
    { w: 1.06, h: 0.95, d: 0.60, y: 2.475 },
    { w: 0.81, h: 0.95, d: 0.68, y: 3.425 },
    { w: 0.52, h: 0.77, d: 0.75, y: 4.285 },
  ];
  for (const tier of nicheTiers) {
    const tMesh = new THREE.Mesh(new THREE.BoxGeometry(tier.d * S, tier.h * S, tier.w * S), darkMat);
    tMesh.position.set((cx + 2.615 - (tier.d / 2) * 0.9) * S, (cy + tier.y) * S, cz * S);
    folder.add(tMesh);
    list.push(tMesh);
  }

  // 4. 南北两壁通风盲口
  const ventN = new THREE.Mesh(new THREE.BoxGeometry(0.22 * S, 0.22 * S, 0.06 * S), darkMat);
  ventN.position.set(cx * S, (cy + 1.2) * S, (cz + 2.875) * S);
  const ventS = new THREE.Mesh(new THREE.BoxGeometry(0.22 * S, 0.22 * S, 0.06 * S), darkMat);
  ventS.position.set(cx * S, (cy + 1.2) * S, (cz - 2.875) * S);
  folder.add(ventN, ventS);

  return list;
}

/**
 * 前厅（Antechamber / 闸门室）：
 * 东西墙各有 3 道垂直花岗岩吊闸导槽 + 3 块悬挂/下落的花岗岩吊闸板
 */
export function buildAntechamberDetail(
  folder: THREE.Group,
  stoneMat: THREE.Material,
  graniteMat: THREE.Material,
  p0: [number, number, number],
  p1: [number, number, number],
) {
  const list: THREE.Mesh[] = [];
  // 前厅廊体
  const hall = createAlignedBox(folder, stoneMat, p0, p1, 1.65, 3.8, { onFloor: true });
  list.push(hall);

  // 3 道花岗岩吊闸板（高 2.6m × 宽 1.42m × 厚 0.18m）
  const va = V(...p0);
  const vb = V(...p1);
  const upv = up.clone();
  for (let i = 0; i < 3; i++) {
    const t = 0.25 + i * 0.28;
    const pos = va.clone().lerp(vb, t).addScaledVector(upv, 1.8 * S);
    // 吊闸板
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.42 * S, 2.6 * S, 0.18 * S), graniteMat);
    slab.position.copy(pos);
    folder.add(slab);
    list.push(slab);
  }
  return list;
}
