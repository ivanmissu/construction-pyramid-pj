import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KhufuRenderPipeline, createDesertEnvironment, type RenderQuality } from './renderPipeline';
import { createStoneTexture } from './stoneTexture';
import { buildConstructionWorkers } from './workers';
import { createOpenPassageGeometry } from './openPassageGeometry';
import { buildTodayExterior } from './todayExterior';
import { DIMS, FEATURES, STATIONS, STEPS, type ViewModeId } from '../data/reference';
import {
  buildGrandGalleryDetail,
  buildKingsChamberDetail,
  buildRelievingChambersDetail,
  buildQueensChamberDetail,
  buildAntechamberDetail,
  buildPassageSteps,
} from './interiorDetail';

/** 米 → 场景单位 */
export const S = 0.1;
export const HALF = DIMS.halfBase * S; // 11.5165
export const HEIGHT = DIMS.height * S; // 14.66
export const N_CORE = 40;
export const N_CASING = 40;
/** 顶石（金字塔尖）底面的高度 */
const CAPSTONE_Y = ((N_CASING - 1) / N_CASING) * HEIGHT - 0.06;

const up = new THREE.Vector3(0, 1, 0);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

/**
 * 逐块砌石系统：金字塔不是“一层层”出现的，而是一块块大石头依次砌上去的。
 * 每一道砌层 = 四条边 × 每边若干块大石（相邻层错缝搭接），
 * 每块石头都有独立的“砌筑时刻”，在本层高度连续落位。
 */
export type BlockSystem = {
  insts: THREE.InstancedMesh[]; // 每道砌层一个 InstancedMesh（外圈石块）
  positions: Float32Array[]; // 每块石块的位置（层底中心）
  quats: Float32Array[]; // 每块石块的朝向
  starts: Float32Array[]; // 每块石块的砌筑时刻（时间轴 0-1）
  sloped: boolean;
  fills: THREE.Mesh[]; // 每道砌层的实体填充（避免塔体空心）
  fillMaterial: THREE.MeshStandardMaterial;
  seams: THREE.Mesh[]; // 贴在平整外壳上的细密石缝带
  fillStarts: Float32Array; // 每道填充层的升起时刻
  fillDur: number;
  dur: number; // 单块落位时长
  nCourses: number;
  blocksPerSide: number;
  /** 该层全部石块已砌完且矩阵已写入终态，后续帧可跳过 */
  settled: Uint8Array;
  hidden: Uint8Array;
  lastP: number;
};

export function buildBlockCourses(
  parent: THREE.Object3D,
  mat: THREE.MeshStandardMaterial,
  nCourses: number,
  sideOf: (y: number) => number, // 场景单位：该高度处的半边长
  tread: number, // 石核的阶梯踏面厚度（场景单位）
  startFrac: number,
  endFrac: number,
  topDown: boolean, // 外壳自上而下铺设；石核自下而上
  blocksPerSide: number,
  shadeJitter = 0.12,
  tilt = 0, // 石块贴合斜面（外壳用），让石块外表面与塔面齐平
  fixedDepth = 0, // 指定石块厚度（外壳为薄贴面），0 = 自动
): BlockSystem {
  const layerH = HEIGHT / nCourses;
  // 棱角由填充棱台补齐，时间轴只统计实际绘制的面石块。
  const perCourse = blocksPerSide * 4;
  const count = nCourses * perCourse;
  const span = endFrac - startFrac;
  // 为最后一块预留落位时间；高速播放时仍有数帧连续运动。
  const dur = Math.min(span * 0.25, Math.max(0.012, (span / Math.max(1, count - 1)) * 6.5));
  const step = (span - dur) / Math.max(1, count - 1);
  const qs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const tmpQ = new THREE.Quaternion();
  const slopeSin = Math.sin(tilt);
  const slopeCos = Math.cos(tilt);
  const insts: THREE.InstancedMesh[] = [];
  const positions: Float32Array[] = [];
  const quats: Float32Array[] = [];
  const starts: Float32Array[] = [];
  const fills: THREE.Mesh[] = [];
  // Cross-section caps stack along the view ray. Give the solid infill its own
  // opacity so ghost views reveal chambers without removing the visible face stones.
  const fillMaterial = mat.clone();
  fillMaterial.transparent = true;
  fillMaterial.depthWrite = true;
  const seams: THREE.Mesh[] = [];
  const fillStarts = new Float32Array(nCourses);


  for (let i = 0; i < nCourses; i++) {
    const y0 = i * layerH;
    const b = Math.max(0.03, sideOf(y0));
    const t = Math.max(0.02, sideOf(y0 + layerH));
    const depth = fixedDepth > 0 ? fixedDepth : Math.max(0.03, b - t) + tread;
    const halfLen = b;
    // 面石块止步于距棱线 depth 处，角部/塔尖由光滑填充棱台补齐 → 交接处磨平
    const faceHalf = Math.max(0.08, halfLen - depth);
    const blockLen = (2 * faceHalf) / blocksPerSide;
    // 外壳石块的高度沿斜面展开而非垂直堆叠，四面始终保持同一平整坡面。
    const courseRun = tilt > 0 ? layerH / slopeCos : layerH;
    const geo = new THREE.BoxGeometry(blockLen * (tilt > 0 ? 0.988 : 1), courseRun * 0.996, depth);
    geo.translate(0, courseRun / 2, 0); // 原点在石块下沿中心 → 缓动时从下沿砌起
    const perFace = blocksPerSide * 4;
    const inst = new THREE.InstancedMesh(geo, mat, perFace);
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.matrixAutoUpdate = false;
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    parent.add(inst);
    insts.push(inst);

    const pos = new Float32Array(perFace * 3);
    const quat = new Float32Array(perFace * 4);
    const stt = new Float32Array(perFace);
    const seqCourse = topDown ? nCourses - 1 - i : i;

    let k = 0;
    for (let s = 0; s < 4; s++) {
      for (let j = 0; j < blocksPerSide; j++, k++) {
        // 相邻砌层错开半块，形成“丁砖错缝”；两端收口避免角部穿插
        let u = (j + 0.5 + (i % 2) * 0.5) * blockLen - faceHalf;
        u = Math.min(Math.max(u, -faceHalf + blockLen / 2), faceHalf - blockLen / 2);
        if (tilt > 0) {
          // 四面分别使用自己的“沿坡向上”向量与外法线。
          // 以前对所有面套同一个 X 轴旋转，导致东/西两条棱上的石块斜躺。
          const outward =
            s === 0
              ? new THREE.Vector3(0, slopeSin, slopeCos)
              : s === 1
                ? new THREE.Vector3(slopeCos, slopeSin, 0)
                : s === 2
                  ? new THREE.Vector3(0, slopeSin, -slopeCos)
                  : new THREE.Vector3(-slopeCos, slopeSin, 0);
          const tangent =
            s === 0
              ? new THREE.Vector3(0, slopeCos, -slopeSin)
              : s === 1
                ? new THREE.Vector3(-slopeSin, slopeCos, 0)
                : s === 2
                  ? new THREE.Vector3(0, slopeCos, slopeSin)
                  : new THREE.Vector3(slopeSin, slopeCos, 0);
          const width = new THREE.Vector3().crossVectors(tangent, outward).normalize();
          const base =
            s === 0
              ? new THREE.Vector3(u, y0, b)
              : s === 1
                ? new THREE.Vector3(b, y0, -u)
                : s === 2
                  ? new THREE.Vector3(-u, y0, -b)
                  : new THREE.Vector3(-b, y0, u);
          // 薄外壳贴面：石块的外表面与整座塔的理论斜面平齐。
          base.addScaledVector(outward, -depth * 0.5 + 0.008);
          pos[k * 3] = base.x;
          pos[k * 3 + 1] = base.y;
          pos[k * 3 + 2] = base.z;
          tmpQ.setFromRotationMatrix(new THREE.Matrix4().makeBasis(width, tangent, outward));
        } else {
          const c = b - depth / 2;
          pos[k * 3] = s === 0 ? u : s === 1 ? c : s === 2 ? -u : -c;
          pos[k * 3 + 1] = y0;
          pos[k * 3 + 2] = s === 0 ? c : s === 1 ? -u : s === 2 ? -c : u;
          tmpQ.setFromAxisAngle(up, qs[s]);
        }
        quat[k * 4] = tmpQ.x;
        quat[k * 4 + 1] = tmpQ.y;
        quat[k * 4 + 2] = tmpQ.z;
        quat[k * 4 + 3] = tmpQ.w;
        stt[k] = startFrac + (seqCourse * perCourse + s * blocksPerSide + j) * step;
        scratchPosition.fromArray(pos, k * 3);
        scratchScale.set(1, 1, 1);
        scratchM.compose(scratchPosition, tmpQ, scratchScale);
        inst.setMatrixAt(k, scratchM);
      }
    }
    // 提前用完整砌层求剔除边界，避免首次只出现一块时锁定过小的包围球。
    inst.computeBoundingSphere();
    if (inst.boundingSphere) inst.boundingSphere.radius += 0.05;
    positions.push(pos);
    quats.push(quat);
    starts.push(stt);

    // 实体填充（棱台）：保证塔体实心，外圈石块负责“砌筑”外观
    // 先让所有填充 + 贴面在初始状态下完全隐藏，由 applyProgress 控制显现。
    const fillGeo = frustumGeometry(b, t, layerH * 1.002);
    const fill = new THREE.Mesh(fillGeo, fillMaterial);
    fill.position.y = y0;
    fill.castShadow = true;
    fill.receiveShadow = true;
    fill.scale.set(0.0001, 0.0001, 0.0001);
    fill.visible = false;
    parent.add(fill);
    fills.push(fill);
    fillStarts[i] = startFrac + seqCourse * perCourse * step;
    // 贴面石块初始全部“未砌起”，inst.count 设为 0 → InstancedMesh 不会渲染。
    inst.count = 0;

    if (tilt > 0) {
      // 外壳接缝不是石块高低错台，而是平整斜面上的极窄凿缝。
      // 做成与塔面共面的细带，缩放后仍能清楚读出严丝合缝的砌筑逻辑。
      const seamVerts: number[] = [];
      const seamWidth = 0.022;
      const facePoint = (face: number, u: number, y: number, half: number) =>
        face === 0
          ? new THREE.Vector3(u, y, half)
          : face === 1
            ? new THREE.Vector3(half, y, -u)
            : face === 2
              ? new THREE.Vector3(-u, y, -half)
              : new THREE.Vector3(-half, y, u);
      const faceNormal = (face: number) =>
        face === 0
          ? new THREE.Vector3(0, slopeSin, slopeCos)
          : face === 1
            ? new THREE.Vector3(slopeCos, slopeSin, 0)
            : face === 2
              ? new THREE.Vector3(0, slopeSin, -slopeCos)
              : new THREE.Vector3(-slopeCos, slopeSin, 0);
      const addSeam = (a: THREE.Vector3, bb: THREE.Vector3, normal: THREE.Vector3) => {
        const dir = bb.clone().sub(a).normalize();
        const perp = new THREE.Vector3().crossVectors(normal, dir).normalize().multiplyScalar(seamWidth / 2);
        // 抬离石材表面 0.03（约 30 cm）确保拉近镜头时缝隙清晰可见，且不被斜面 z-fighting 吞掉
        const push = normal.clone().multiplyScalar(0.03);
        const p0 = a.clone().add(push).add(perp);
        const p1 = bb.clone().add(push).add(perp);
        const p2 = bb.clone().add(push).sub(perp);
        const p3 = a.clone().add(push).sub(perp);
        seamVerts.push(...p0.toArray(), ...p1.toArray(), ...p2.toArray(), ...p0.toArray(), ...p2.toArray(), ...p3.toArray());
      };
      for (let face = 0; face < 4; face++) {
        const normal = faceNormal(face);
        // 砌层水平缝；仅保留每层底缝，避免重叠加深。
        addSeam(facePoint(face, -b, y0, b), facePoint(face, b, y0, b), normal);
        // 同一层内的竖缝，奇偶层错开半块。
        for (let j = 1; j < blocksPerSide; j++) {
          const frac = (j + (i % 2) * 0.5) / blocksPerSide;
          if (frac >= 1) continue;
          addSeam(
            facePoint(face, -b + frac * b * 2, y0, b),
            facePoint(face, -t + frac * t * 2, y0 + layerH, t),
            normal,
          );
        }
      }
      const seamGeo = new THREE.BufferGeometry();
      seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(seamVerts, 3));
      seamGeo.computeVertexNormals();
      const seam = new THREE.Mesh(
        seamGeo,
        new THREE.MeshBasicMaterial({
          color: 0xbdb3a0, // 比石材略深的缝影，读得出接缝但不破坏白度
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      seam.renderOrder = 4;
      parent.add(seam);
      seams.push(seam);
    } else {
      const none = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
      none.visible = false;
      seams.push(none);
    }

    // 每块石头明度略有差异，呈现天然石材质感
    const tint = new THREE.Color();
    for (let k2 = 0; k2 < perFace; k2++) {
      const r = (i * 31 + k2 * 17) % 100;
      const shade = 1 - shadeJitter * (r / 100);
      tint.setRGB(shade, shade, shade);
      inst.setColorAt(k2, tint);
    }
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }

  return {
    insts,
    positions,
    quats,
    starts,
    fills,
    fillMaterial,
    seams,
    fillStarts,
    fillDur: Math.max(dur, step * (perCourse - 1) + dur),
    dur,
    sloped: tilt > 0,
    nCourses,
    blocksPerSide,
    settled: new Uint8Array(nCourses),
    hidden: new Uint8Array(nCourses),
    lastP: -1,
  };
}

const scratchM = new THREE.Matrix4();
const scratchQ = new THREE.Quaternion();
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();

/** 按时间轴进度连续落位；只为正在变化的砌层上传实例矩阵。 */
export function updateBlocks(sys: BlockSystem, p: number, keepCourse?: (course: number) => boolean) {
  p = clamp01(p);
  for (let c = 0; c < sys.nCourses; c++) {
    const inst = sys.insts[c];
    const fill = sys.fills[c];
    const seam = sys.seams[c];
    const stt = sys.starts[c];
    const n = stt.length;
    const keep = !keepCourse || keepCourse(c);
    if (!keep || p <= stt[0]) {
      // 通过绘制数量隐藏，保留矩阵缓存；过滤模式不会留下薄薄的一整层填充。
      inst.count = 0;
      fill.visible = false;
      seam.visible = false;
      sys.hidden[c] = 1;
      continue;
    }
    const wasHidden = sys.hidden[c] === 1;
    sys.hidden[c] = 0;
    // 实体填充始终锚定本层底部；仅沿 y 生长，避免棱台穿出塔面。
    const fl = smooth((p - sys.fillStarts[c]) / sys.fillDur);
    fill.scale.set(1, fl, 1);
    fill.visible = true;
    seam.visible = sys.sloped && p >= sys.fillStarts[c] + sys.fillDur * 0.55;

    const complete = p >= stt[n - 1] + sys.dur;
    if (complete && sys.settled[c]) {
      inst.count = n;
      continue;
    }
    if (!wasHidden && p === sys.lastP) continue;

    const pos = sys.positions[c];
    const quat = sys.quats[c];
    let builtCount = 0;
    for (let k = 0; k < n; k++) {
      if (p <= stt[k]) break;
      const local = easeOutCubic((p - stt[k]) / sys.dur);
      const drop = (1 - local) * (1 - local) * Math.min(0.045, (HEIGHT / sys.nCourses) * 0.12);
      scratchQ.set(quat[k * 4], quat[k * 4 + 1], quat[k * 4 + 2], quat[k * 4 + 3]);
      scratchPosition.set(pos[k * 3], pos[k * 3 + 1] + drop, pos[k * 3 + 2]);
      scratchScale.set(1, Math.max(0.00001, local), 1);
      // compose 缩放完整的局部基向量，保留坡面旋转和本层的世界高度。
      scratchM.compose(scratchPosition, scratchQ, scratchScale);
      inst.setMatrixAt(k, scratchM);
      builtCount = k + 1;
    }
    inst.count = builtCount;
    inst.instanceMatrix.clearUpdateRanges();
    inst.instanceMatrix.addUpdateRange(0, builtCount * 16);
    inst.instanceMatrix.needsUpdate = true;
    sys.settled[c] = complete ? 1 : 0;
  }
  sys.lastP = p;
}

/* ------------------------------------------------------------------ 几何工具 */

/**
 * 方棱台砌体：底面正方形（y = 0，half = bottomHalf）→ 顶面正方形（y = h，half = topHalf）
 * 原点在层底中心、Y 轴向上。每个面都按“面心相对轴线中点”自动校正绕向，
 * 确保六个面的法线全部朝外（曾经因为绕向错误 + 轴向错位，整座塔塌成一片“三角墙”）。
 */
export function frustumGeometry(bottomHalf: number, topHalf: number, h: number) {
  const b = bottomHalf;
  const t = topHalf;
  // X-Z 平面上的正方形（y = 0 为层底，y = h 为层顶）
  const v: [number, number, number][] = [
    [-b, 0, -b],
    [-b, 0, b],
    [b, 0, b],
    [b, 0, -b],
    [-t, h, -t],
    [-t, h, t],
    [t, h, t],
    [t, h, -t],
  ];
  const quads = [
    [4, 5, 6, 7], // 顶面
    [0, 3, 2, 1], // 底面
    [0, 1, 5, 4], // 侧面 1
    [1, 2, 6, 5], // 侧面 2
    [2, 3, 7, 6], // 侧面 3
    [3, 0, 4, 7], // 侧面 4
  ];
  const P = (i: number) => new THREE.Vector3(v[i][0], v[i][1], v[i][2]);
  const pos: number[] = [];
  for (const raw of quads) {
    const q = raw.slice();
    const n = new THREE.Vector3()
      .subVectors(P(q[1]), P(q[0]))
      .cross(new THREE.Vector3().subVectors(P(q[2]), P(q[0])));
    const c = new THREE.Vector3();
    q.forEach((i) => c.add(P(i)));
    c.multiplyScalar(0.25);
    const outward = new THREE.Vector3(c.x, c.y - h * 0.5, c.z); // 面心 − 轴线中点
    if (n.dot(outward) < 0) q.reverse();
    for (const tri of [
      [q[0], q[1], q[2]],
      [q[0], q[2], q[3]],
    ]) {
      for (const i of tri) pos.push(v[i][0], v[i][1], v[i][2]);
    }
  }
  const g = new THREE.BufferGeometry();
  // 入参已经是场景单位（HALF / HEIGHT 已乘过 S），此处不可再次缩放
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function boxMesh(w: number, h: number, d: number, material: THREE.Material, pos: [number, number, number]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), material);
  m.position.set(pos[0] * S, pos[1] * S, pos[2] * S);
  m.castShadow = true;
  return m;
}

/** 由 a 到 b 的矩形通道；onFloor=true 时顶面沿轴线生成，底面对齐 a-b 线 */
export function tubeMesh(
  folder: THREE.Object3D,
  a: [number, number, number],
  b: [number, number, number],
  w: number,
  h: number,
  material: THREE.Material,
  onFloor = true,
  name = 'tube',
) {
  const va = new THREE.Vector3(a[0] * S, a[1] * S, a[2] * S);
  const vb = new THREE.Vector3(b[0] * S, b[1] * S, b[2] * S);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  dir.normalize();
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  const upv = new THREE.Vector3().crossVectors(right, dir).normalize();
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  if (onFloor) mid.addScaledVector(upv, (h * S) / 2);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, len), material);
  mesh.name = name;
  mesh.position.copy(mid);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, upv, dir));
  mesh.castShadow = true;
  folder.add(mesh);
  return mesh;
}



/* ------------------------------------------------------------------ 场景构建 */

type Growth = { obj: THREE.Object3D; t0: number; t1: number; axis: 'z' | 'y' | 'pop' | 'none' };

export type FeatureMesh = { id: string; group: THREE.Group; meshes: THREE.Mesh[]; growth: Growth[] };

export type BuiltScene = {
  root: THREE.Group;
  shell: THREE.Group; // 外壳（石灰岩）
  core: THREE.Group; // 石核
  internals: THREE.Group;
  extra: THREE.Group; // 坡道 / 雪橇 / 采石场
  capstone: THREE.Mesh;
  entranceOpening: THREE.Mesh;
  portalGates: { obj: THREE.Object3D; course: number }[];
  /** 顶石所覆盖的起始砌层：顶石盖上后，该层以上的石核/外壳不再绘制
      （否则白色塔尖会从金色顶石里戳出来） */
  capCourseFrom: number;
  coreEdges: THREE.LineSegments;
  casingEdges: THREE.LineSegments;
  pit: THREE.Group;
  features: FeatureMesh[];
  ground: THREE.Mesh;
  groundPlug: THREE.Mesh;
  plateau: THREE.Mesh;
  rampSlabs: THREE.Mesh[];
  sleds: { mesh: THREE.Mesh; dist: number; level: number; halfLen: number }[];
  coreMat: THREE.MeshStandardMaterial;
  casingMat: THREE.MeshStandardMaterial;
  edgeMat: THREE.LineBasicMaterial;
  /** 地面补块 / 基坑 / 平台的独立材质（建造收尾时做交叉淡入淡出，不能与沙漠共用材质） */
  plugMat: THREE.MeshStandardMaterial;
  pitMat: THREE.MeshStandardMaterial;
  plateauMat: THREE.MeshStandardMaterial;
  coreSys: BlockSystem;
  casingSys: BlockSystem;
};

export function buildModel(): BuiltScene {
  const root = new THREE.Group();
  const shell = new THREE.Group();
  const core = new THREE.Group();
  const internals = new THREE.Group();
  const extra = new THREE.Group();
  root.add(shell, core, internals, extra);

  const stoneGrain = createStoneTexture();
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xbfae8e, roughness: 0.98, metalness: 0.0, bumpMap: stoneGrain, bumpScale: 0.012, roughnessMap: stoneGrain });
  // 采石场方料 / 运石雪橇用独立材质，避免随“石核半透明”一起变透明
  const blockMat = new THREE.MeshStandardMaterial({ color: 0xb8a684, roughness: 1, bumpMap: stoneGrain, bumpScale: 0.008 });
  // 真正纯白：图拉石灰岩打磨后的外露本色。
  const casingMat = new THREE.MeshStandardMaterial({ color: 0xfff9ef, roughness: 0.64, metalness: 0, bumpMap: stoneGrain, bumpScale: 0.003, roughnessMap: stoneGrain });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xe8b955,
    roughness: 0.23,
    metalness: 0.95,
    emissive: new THREE.Color(0x3a2300),
    emissiveIntensity: 0.12,
  });

  /* --- 石核：逐块砌石（每层 = 四边 × 4 块大石，相邻层错缝） --- */
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x6f5f45, transparent: true, opacity: 0.55 });
  const coreEdges = new THREE.LineSegments(new THREE.BufferGeometry(), edgeMat); // 兼容占位
  core.add(coreEdges);

  // 关键：石核以“上一层已收进的边界”作为本层外皮，保证竖直石面永远
  // 藏在外壳斜面之内（此前用本层底面边界，竖直面会在每层上部戳出斜面
  // 2 m 左右，导致外观大面积露出黄色石核）。
  const coreStep = HEIGHT / N_CORE;
  const coreSys = buildBlockCourses(
    core,
    coreMat,
    N_CORE,
    (y) => Math.max(0.06, HALF * (1 - (y + coreStep) / HEIGHT) - 0.015),
    0.055, // 石核阶梯踏面
    0.06,
    0.55,
    false,
    8,
    0.08,
  );

  /* --- 外壳：图拉石灰岩大块砌体（错缝，严丝合缝） --- */
  const casingSys = buildBlockCourses(
    shell,
    casingMat,
    N_CASING,
    (y) => HALF * (1 - y / HEIGHT) * 1.006,
    0,
    0.7,
    0.92,
    true,
    8,
    0, // 完全无明暗抖动 → 真正的纯白外壳
    Math.atan(HALF / HEIGHT),
    0.26,
  );
  const casingEdges = new THREE.LineSegments(new THREE.BufferGeometry(), edgeMat); // 兼容占位
  shell.add(casingEdges);

  // 顶石：坐在砌体顶端并略微外挑（7%），保证金色完整可见、不被白色外壳吞掉
  const CAP_H = 0.72; // ≈ 7.2 m
  const capBaseY = HEIGHT - CAP_H;
  const capBaseHalf = HALF * (CAP_H / HEIGHT) * 1.07;
  const capstone = new THREE.Mesh(frustumGeometry(capBaseHalf, 0.012, CAP_H * 1.02), goldMat);
  capstone.name = '顶石 Pyramidion';
  capstone.position.y = capBaseY;
  capstone.userData.baseY = capBaseY;
  shell.add(capstone);

  /* --- 北面两处入口（贴面式门洞：嵌入塔面，绝不凸出）
         A 原始入口：北面距地 17 m（真实位置在中轴线以东 7.29 m，剖面示意居中）
         B 阿尔·马蒙盗墓道（820 年）：北面距地约 7 m --- */
  const portalMat = new THREE.MeshStandardMaterial({
    color: 0x0a0805,
    roughness: 1,
    emissive: new THREE.Color(0x000000),
    side: THREE.DoubleSide,
  });
  const casingHalfAt = (y: number) => DIMS.halfBase * (1 - y / DIMS.height); // 返回米
  // 北面塔面的外法向与沿坡向上方向
  const faceN = new THREE.Vector3(0, HALF, HEIGHT).normalize();
  const faceUp = new THREE.Vector3(0, HEIGHT, -HALF).normalize();
  const faceX = new THREE.Vector3(1, 0, 0);
  const basisQ = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(faceX, faceUp, faceN),
  );
  const makePortal = (yM: number, wM: number, hM: number, thM: number) => {
    const surf = casingHalfAt(yM) * S;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(wM * S, hM * S, thM * S), portalMat);
    mesh.quaternion.copy(basisQ);
    mesh.position
      .set(0, yM * S, surf)
      .addScaledVector(faceN, -thM * S * 0.46); // 前脸几乎与塔面齐平
    return mesh;
  };
  // 记录各凿口所在的砌层，建造动画中随该层砌成后才出现（避免悬浮在空中）
  const portalGates: { obj: THREE.Object3D; course: number }[] = [];
  const courseOfMeter = (yM: number) =>
    Math.min(N_CASING - 1, Math.max(0, Math.floor((yM * S) / (HEIGHT / N_CASING))));
  const entranceOpening = makePortal(17, 2.2, 2.9, 0.7);
  entranceOpening.name = '原始入口（北面 17 m 高处）';
  shell.add(entranceOpening);
  portalGates.push({ obj: entranceOpening, course: courseOfMeter(17) });
  // 入口上方的双层人字过梁（两片巨石斜靠成 Λ 形，贴于塔面）
  const lintelMat = new THREE.MeshStandardMaterial({ color: 0xe9e0c8, roughness: 0.6, side: THREE.DoubleSide });
  const lintelC = new THREE.Vector3(0, 17 * S, casingHalfAt(17) * S)
    .addScaledVector(faceUp, 1.75 * S)
    .addScaledVector(faceN, -0.25 * S);
  for (const [xOff, ang] of [
    [-0.34, 38],
    [0.34, -38],
  ] as const) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2.6 * S, 0.95 * S, 0.6 * S), lintelMat);
    const qR = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (ang * Math.PI) / 180);
    slab.quaternion.copy(basisQ.clone().multiply(qR));
    slab.position.copy(lintelC).addScaledVector(faceX, xOff * S);
    shell.add(slab);
    portalGates.push({ obj: slab, course: courseOfMeter(19) }); // 过梁在门楣之上，随更高一层
  }
  const mamunOpening = makePortal(7.4, 1.9, 2.3, 0.7);
  mamunOpening.name = '阿尔·马蒙盗墓道入口（约 820 年）';
  shell.add(mamunOpening);
  portalGates.push({ obj: mamunOpening, course: courseOfMeter(7.4) });
  // 初始隐藏，由建造进度决定何时“凿出”
  portalGates.forEach(({ obj }) => (obj.visible = false));

  /* --- 说明：原“金字塔轮廓线”（4 条斜棱 + 每 4 层一道水平环线）已移除。
         那些水平环在建造过程中会浮在空中，看起来像莫名其妙的小方块；
         现在石缝由砌块自身表达，不再需要额外的线框。 --- */

  /* --- 内部结构 --- */
  const features: FeatureMesh[] = [];
  const P = (
    id: string,
    t0: number,
    t1: number,
    builder: (folder: THREE.Group, mat: THREE.MeshStandardMaterial, t0: number, t1: number) => THREE.Mesh[],
  ) => {
    const f = FEATURES.find((x) => x.id === id)!;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(f.color),
      roughness: 0.35,
      metalness: 0.15,
      emissive: new THREE.Color(f.color),
      emissiveIntensity: 0.16,
      // 实体不透明：内部漫游时深度排序正确，墙体不会被“幽灵石核”盖住
      transparent: false,
      // 双面渲染：站在墓室/通道“里面”时能看见墙体（内部漫游必需）
      side: THREE.DoubleSide,
    });
    const group = new THREE.Group();
    group.name = f.name;
    internals.add(group);
    const meshes = builder(group, mat, t0, t1);
    const growth: Growth[] = [];
    // 未显式指定时刻的构件：按列表顺序依次“落位”（墓室构件逐个就位）
    const n = Math.max(1, meshes.length);
    meshes.forEach((m, i) => {
      if (m.userData.t0 === undefined) {
        m.userData.t0 = t0 + (t1 - t0) * (i / n);
        m.userData.t1 = t0 + (t1 - t0) * ((i + 0.85) / n);
      }
    });
    // 描边（与所属网格共享轴向与时刻）
    for (const m of meshes) {
      const axis = (m.userData.growAxis ?? 'y') as 'z' | 'y' | 'pop';
      const mt0 = (m.userData.t0 as number) ?? t0;
      const mt1 = (m.userData.t1 as number) ?? t1;
      growth.push({ obj: m, t0: mt0, t1: mt1, axis });
      const eg = new THREE.LineSegments(
        new THREE.EdgesGeometry(m.geometry as THREE.BufferGeometry),
        new THREE.LineBasicMaterial({ color: f.color, transparent: true, opacity: 0.75 }),
      );
      eg.position.copy(m.position);
      eg.quaternion.copy(m.quaternion);
      group.add(eg);
      growth.push({ obj: eg, t0: mt0, t1: mt1, axis });
    }
    group.userData.t0 = t0;
    group.userData.t1 = t1;
    features.push({ id, group, meshes, growth });
    return group;
  };

  // 石砌环框隧道：把一条通道切成一圈圈石环，自入口向内依次砌成
  const ringTunnel = (
    folder: THREE.Group,
    mat: THREE.Material,
    a: [number, number, number],
    b: [number, number, number],
    w: number,
    h: number,
    ringCount: number,
    t0: number,
    t1: number,
  ) => {
    const va = new THREE.Vector3(a[0], a[1], a[2]);
    const vb = new THREE.Vector3(b[0], b[1], b[2]);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    dir.normalize();
    const right = new THREE.Vector3().crossVectors(up, dir).normalize();
    const upv = new THREE.Vector3().crossVectors(dir, right).normalize();
    const ringLen = len / ringCount;
    const out: THREE.Mesh[] = [];
    for (let i = 0; i < ringCount; i++) {
      const c = va.clone().addScaledVector(dir, (i + 0.5) * ringLen);
      const geo = createOpenPassageGeometry(w * S, h * S, ringLen * S);
      const mesh = new THREE.Mesh(geo, mat);
      // 输入轴线与插值中心仍以米计；位置和几何必须使用同一场景比例。
      mesh.position.copy(c).multiplyScalar(S).addScaledVector(upv, (h * S) / 2);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, upv, dir));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.growAxis = 'pop';
      mesh.userData.t0 = t0 + (t1 - t0) * (i / ringCount);
      mesh.userData.t1 = t0 + (t1 - t0) * ((i + 1) / ringCount);
      folder.add(mesh);
      out.push(mesh);
    }
    return out;
  };

  const boxIn = (
    folder: THREE.Group,
    mat: THREE.Material,
    size: [number, number, number],
    p: [number, number, number],
    doubleSide = false,
  ) => {
    const m = boxMesh(size[0], size[1], size[2], mat, p);
    if (doubleSide) {
      const dmat = (m.material as THREE.MeshStandardMaterial).clone();
      dmat.side = THREE.DoubleSide;
      m.material = dmat;
    }
    folder.add(m);
    return m;
  };
  // 沿任意轴线 a→b 放置的长方体（通道、塞石、挑檐、坡道、斜井）；
  // local z 沿轴线、local x 沿横截面水平、local y 沿法向(上)；
  // side=沿水平法向左右偏移，normal=沿法向上下偏移（单位：米）
  const Vm = (p: [number, number, number]) => new THREE.Vector3(p[0] * S, p[1] * S, p[2] * S);
  const axisBox = (
    folder: THREE.Group,
    mat: THREE.Material,
    a: [number, number, number],
    b: [number, number, number],
    w: number,
    h: number,
    onFloor = false,
    side = 0,
    normal = 0,
  ) => {
    const va = Vm(a);
    const vb = Vm(b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    dir.normalize();
    const right = new THREE.Vector3().crossVectors(up, dir).normalize();
    const upv = new THREE.Vector3().crossVectors(dir, right).normalize();
    // 几何沿 +local z 平移半长，使枢轴落在起点 a；这样对 local z 做缩放时
    // 通道会沿 a→b 方向“掘进生长”，而不是从中点向两侧膨胀
    const geo = new THREE.BoxGeometry(w * S, h * S, len);
    geo.translate(0, 0, len / 2);
    const origin = va.clone();
    if (onFloor) origin.addScaledVector(upv, (h * S) / 2);
    if (side) origin.addScaledVector(right, side * S);
    if (normal) origin.addScaledVector(upv, normal * S);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, upv, dir));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.growAxis = 'z';
    folder.add(mesh);
    return mesh;
  };
  // 阿斯旺红花岗岩（塞石、闸门、石棺、大梁）
  const granite = new THREE.MeshStandardMaterial({
    color: 0x9c5048,
    roughness: 0.45,
    metalness: 0.08,
    emissive: new THREE.Color(0x2a0f0c),
    emissiveIntensity: 0.12,
    side: THREE.DoubleSide,
  });
  // 雪松木踏步梯板材质
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x6e4522,
    roughness: 0.8,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  // 阴影与插孔黑腔材质
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x110e0c,
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  // 通道砌体基岩/粗石灰岩（实心地板与侧墙）
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x9a8a6c,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  // =====================================================================
  //  内部结构 —— 精细化真实建筑构件（所有通道连通，含防滑梯踏步与叠涩拱）
  // =====================================================================
  const G0: [number, number, number] = [0, 21.3, 41.4];
  const G1: [number, number, number] = [0, 42.35, -1.6];

  // ① 原入口（北面 17 m）、26°31′ 下降通道（105 m）、阿尔·马蒙盗墓道 + 地面梯步
  P('entrance', 0.15, 0.28, (g, _m, t0, t1) => {
    const list: THREE.Mesh[] = [];
    // 下降通道：一圈圈石砌环框自入口向内依次砌成
    list.push(...ringTunnel(g, limestoneMat(), [0, 17, 101.8], [0, -29.9, 8.0], 1.04, 1.17, 36, t0, t1));
    // 实心石地板（楼梯嵌在砌体里，随通道一并出现）
    const floor = axisBox(g, rockMat, [0, 17, 101.8], [0, -29.9, 8.0], 1.9, 0.5, false, 0, -0.25);
    floor.userData.growAxis = 'z';
    floor.userData.t0 = t0;
    floor.userData.t1 = t1;
    list.push(floor);
    // 沿 26°31′ 下降坡道铺设的防滑木梯级（80 级，真实攀爬踏板）
    const steps = buildPassageSteps(g, woodMat, [0, 17, 101.8], [0, -29.9, 8.0], 80, 0.9, 0.045, 0.14);
    steps.userData.growAxis = 'pop';
    steps.userData.t0 = t0;
    steps.userData.t1 = t1;
    list.push(steps as unknown as THREE.Mesh);
    // 阿尔·马蒙盗墓道（820 年）：北面 7.4 m 水平掘进 27 m，接通上升通道底端
    list.push(...ringTunnel(g, limestoneMat(), [0, 7.4, 109.6], [0, 7.4, 80.0], 0.9, 1.3, 14, t0, t1));
    list.push(...ringTunnel(g, limestoneMat(), [0, 7.4, 80.0], [0.3, 4.9, 77.2], 0.9, 1.3, 6, t0, t1));
    return list;
  });

  // ② 地下墓室（深 −27 m；14.1 m 东西 × 8.4 m 南北 × 高 4 m 粗凿洞窟）
  P('subterranean', 0.18, 0.26, (g, m, t0, t1) => {
    const list: THREE.Mesh[] = [];
    // 下降通道尽头的水平甬道：石环框逐圈砌成
    list.push(...ringTunnel(g, m, [0, -29.9, 8.0], [0, -29.9, 1.3], 0.9, 0.95, 8, t0, t1));
    // 主墓室（东西长轴）—— 构件依次落位
    const chamber = boxIn(g, m, [14.1, 4.0, 8.4], [0, -31.9, -3], true);
    chamber.userData.growAxis = 'y';
    list.push(chamber);
    // 地面未完工深坑（深 4.4 m）
    list.push(boxIn(g, darkMat, [3.0, 4.4, 3.0], [2.6, -36.0, -3], true));
    // 南墙死巷（约 16 m）—— 石环框
    list.push(...ringTunnel(g, m, [0, -30.2, -7.2], [0, -30.2, -23], 0.85, 1.0, 8, t0, t1));
    // 57 m 服务竖井（大画廊底端西墙 → 下降通道底部）—— 石环框
    list.push(...ringTunnel(g, m, [-1.05, 22.6, 40.0], [-0.9, -27.8, 12.0], 0.85, 0.85, 18, t0, t1));
    return list;
  });

  // ③ 上升通道（39.3 m，1.04 × 1.17 m，坡度 26°02′）+ 3 块花岗岩塞石 + 防滑梯级
  P('ascending', 0.3, 0.37, (g, m, t0, t1) => {
    const list: THREE.Mesh[] = [];
    // 上升通道：石环框逐圈砌成
    list.push(...ringTunnel(g, m, [0, 3.8, 77.8], G0, 1.04, 1.17, 18, t0, t1));
    // 实心石地板
    const floor = axisBox(g, rockMat, [0, 3.8, 77.8], G0, 1.9, 0.5, false, 0, -0.25);
    floor.userData.growAxis = 'z';
    floor.userData.t0 = t0;
    floor.userData.t1 = t1;
    list.push(floor);
    // 沿上升通道地面铺设的 56 级木质防滑梯板
    const steps = buildPassageSteps(g, woodMat, [0, 3.8, 77.8], G0, 56, 0.9, 0.045, 0.14);
    steps.userData.growAxis = 'pop';
    steps.userData.t0 = t0;
    steps.userData.t1 = t1;
    list.push(steps as unknown as THREE.Mesh);
    // 3 块红花岗岩塞石（各 1.5 m）—— 依次落入
    const pt = (t: number): [number, number, number] => [0, 3.8 + 17.5 * t, 77.8 - 36.4 * t];
    [0.06, 0.115, 0.17].forEach((c, i) => {
      const plug = axisBox(g, granite, pt(c - 0.02), pt(c + 0.02), 1.0, 1.12, false);
      plug.userData.growAxis = 'pop';
      plug.userData.t0 = t0 + (t1 - t0) * (0.4 + i * 0.2);
      plug.userData.t1 = t0 + (t1 - t0) * (0.55 + i * 0.2);
      list.push(plug);
    });
    return list;
  });

  // ④ 大画廊（精细化 7 层叠涩挑檐 + 40 块棘轮顶盖 + 27 对插孔坡道 + 中央 72 级木踏步）
  P('gallery', 0.42, 0.5, (g, m, t0, t1) => {
    const list = buildGrandGalleryDetail(g, m, woodMat, darkMat, G0, G1, t0, t1);
    // 顶端大台阶（The Great Step，高 0.9 m × 宽 1.5 m，通往前厅）
    const step = axisBox(g, m, [0, 42.5, -1.2], [0, 43.2, -1.9], 1.5, 0.9, false);
    step.userData.growAxis = 'pop';
    list.push(step);
    return list;
  });

  // ⑤ 水平通道 → 王后墓室（5 层叠涩凹龛 + 人字梁屋顶 + 通风盲井）
  P('queens', 0.32, 0.39, (g, m, t0, t1) => {
    const list: THREE.Mesh[] = [];
    // 水平通道：石环框逐圈砌成（前段高 1.15 m）
    list.push(...ringTunnel(g, m, G0, [0, 21.3, 5.6], 1.05, 1.15, 18, t0, t1));
    // 后段经台阶加高至 1.7 m
    list.push(...ringTunnel(g, m, [0, 21.6, 5.6], [0, 21.9, 2.9], 1.05, 1.7, 5, t0, t1));
    // 王后墓室精细构件（东墙 5 层叠涩凹龛 + 尖顶人字梁 + 南北盲井口）—— 依次落位
    const qDetails = buildQueensChamberDetail(g, m, darkMat, 0, 21.3, 0);
    list.push(...qDetails);
    // 南北盲井向外延伸段（未穿透外壳）—— 石环框
    list.push(...ringTunnel(g, m, [0, 22.5, 2.9], [0, 22.5, 5.2], 0.22, 0.22, 4, t0, t1));
    list.push(...ringTunnel(g, m, [0, 22.5, 5.2], [0, 41.0, 30.0], 0.22, 0.22, 14, t0, t1));
    list.push(...ringTunnel(g, m, [0, 22.5, -2.9], [0, 22.5, -5.2], 0.22, 0.22, 4, t0, t1));
    list.push(...ringTunnel(g, m, [0, 22.5, -5.2], [0, 43.0, -27.0], 0.22, 0.22, 14, t0, t1));
    return list;
  });

  // ⑥ 前厅（3 道花岗岩吊闸导槽与闸门）→ 短甬道 → 国王墓室（镂空石棺 + 9 根平顶横梁）
  P('kings', 0.56, 0.63, (g, m, t0, t1) => {
    const list: THREE.Mesh[] = [];
    // 进前厅通道：石环框
    list.push(...ringTunnel(g, m, [0, 42.9, -1.7], [0, 43.6, -2.1], 1.2, 1.4, 4, t0, t1));
    // 闸门前厅精细构件（3 道花岗岩吊闸板）—— 依次落位
    const ante = buildAntechamberDetail(g, m, granite, [0, 43.6, -2.1], [0, 43.6, -4.8]);
    list.push(...ante);
    // 短甬道进国王墓室北墙：石环框
    list.push(...ringTunnel(g, m, [0, 43.6, -4.8], [0, 43.6, -5.4], 1.05, 1.05, 3, t0, t1));
    // 国王墓室精细构件（镂空花岗岩石棺、9 块平顶大梁、南北 0.91 m 井口）—— 依次落位
    const kDetails = buildKingsChamberDetail(g, granite, darkMat, [0, 43.0, -8]);
    list.push(...kDetails);
    // 国王墓室南北通风井（穿透花岗岩并以 31° / 45° 穿出外立面）—— 石环框
    list.push(...ringTunnel(g, m, [2.0, 43.91, -5.3], [2.0, 43.91, -3.3], 0.2, 0.2, 2, t0, t1));
    list.push(...ringTunnel(g, m, [2.0, 43.91, -3.3], [2.0, 78.0, 52.0], 0.2, 0.2, 20, t0, t1));
    list.push(...ringTunnel(g, m, [-2.0, 43.91, -10.7], [-2.0, 43.91, -12.7], 0.2, 0.2, 2, t0, t1));
    list.push(...ringTunnel(g, m, [-2.0, 43.91, -12.7], [-2.0, 82.0, -50.0], 0.2, 0.2, 20, t0, t1));
    return list;
  });

  // ⑦ 5 层减压室 + 顶部双人字形巨石屋脊（Davison, Wellington, Nelson, Arbuthnot, Campbell）
  P('relieving', 0.57, 0.66, (g, m) => {
    return buildRelievingChambersDetail(g, m, granite, 0, 48.84, -8);
  });

  // ⑧ 2016 μ 子成像发现的北侧隐藏走廊（王后墓室人字梁上方）
  P('north-corridor', 0.44, 0.51, (g, m, t0, t1) =>
    ringTunnel(g, m, [0, 28.6, 3.5], [1.8, 31.5, 12.0], 1.5, 1.6, 6, t0, t1),
  );

  // ⑨ 通风井汇总标签（实体已在国王/王后墓室中建出，这里只保留可选中的时间点）
  P('shafts', 0.66, 0.76, () => []);

  // ⑩ 2017 “大空腔”：大画廊正上方、与画廊同坡度，长约 30 m
  P('big-void', 0.62, 0.71, (g, m) => {
    const voidMesh = axisBox(g, m, [0, 36.0, 32.0], [0, 51.0, 2.0], 6, 7, false);
    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(voidMesh.geometry as THREE.BufferGeometry),
      new THREE.LineBasicMaterial({ color: 0xdfe9f5, transparent: true, opacity: 0.9 }),
    );
    wire.position.copy(voidMesh.position);
    wire.quaternion.copy(voidMesh.quaternion);
    g.add(wire);
    return [voidMesh];
  });

  // ⑪ 太阳船坑（东侧）
  P('boat', 0.87, 0.92, (g, m) => [
    boxIn(g, m, [7, 3, 44], [139, -1.6, 2]),
    ...[...Array(14)].map((_, i) => boxIn(g, m, [7.4, 0.9, 1.05], [139, 0.6, -15 + i * 2.3])),
  ]);

  // 通道统一用的内部石灰岩材质（与各特征配色一致但更贴近真实浅色灰岩）
  function limestoneMat() {
    return new THREE.MeshStandardMaterial({
      color: 0xd8c9a6,
      roughness: 0.85,
      metalness: 0.02,
      emissive: new THREE.Color(0x2a2110),
      emissiveIntensity: 0.05,
      side: THREE.DoubleSide,
    });
  }

  /* --- 地面 / 高原 / 采石场 ---
     地面为“带方形缺口的沙漠”，缺口下方露出基岩以下的内部结构；
     缺口在实体外观模式下由 groundPlug 补齐，保证外立面视图完整。 */
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xc9b183, roughness: 1 });
  const hole = HALF * 1.08; // 缺口半宽（场景单位，略大于底座轮廓）
  const shape = new THREE.Shape();
  shape.moveTo(-260, -260);
  shape.lineTo(260, -260);
  shape.lineTo(260, 260);
  shape.lineTo(-260, 260);
  shape.closePath();
  const path = new THREE.Path();
  path.moveTo(-hole, -hole);
  path.lineTo(-hole, hole);
  path.lineTo(hole, hole);
  path.lineTo(hole, -hole);
  path.closePath();
  shape.holes.push(path);

  const ground = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), sandMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.32;
  ground.receiveShadow = true;
  ground.name = '沙漠地表';
  extra.add(ground);

  const plugMat = sandMat.clone();
  const groundPlug = new THREE.Mesh(new THREE.PlaneGeometry(hole * 2, hole * 2), plugMat);
  groundPlug.rotation.x = -Math.PI / 2;
  groundPlug.position.y = -0.321;
  groundPlug.receiveShadow = true;
  groundPlug.name = '地表补块（破口）';
  extra.add(groundPlug);

  const plateauMat = new THREE.MeshStandardMaterial({ color: 0x9c8a68, roughness: 1 });
  const plateau = new THREE.Mesh(new THREE.BoxGeometry(HALF * 4.2, 0.34, HALF * 4.2), plateauMat);
  plateau.position.y = -0.2; // 顶面略低于金字塔底面，避免与石核底面共面闪烁
  plateau.receiveShadow = true;
  extra.add(plateau);

  // 两处后方供料场：成排码放，给塔基四周的工队和雪橇留出运输通道。
  const blockGeo = new THREE.BoxGeometry(0.22, 0.16, 0.28);
  const blockCount = 160;
  const blocks = new THREE.InstancedMesh(blockGeo, blockMat, blockCount);
  blocks.name = '施工场待用石料';
  blocks.position.y = -0.32;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  let rnd = 987654321;
  const rand = () => {
    rnd = (rnd * 1103515245 + 12345) % 2147483648;
    return rnd / 2147483648;
  };
  for (let i = 0; i < blockCount; i++) {
    const yard = Math.floor(i / 80);
    const slot = i % 80;
    const row = Math.floor(slot / 8);
    const column = slot % 8;
    const x = (yard === 0 ? -10.6 : 7) + column * 0.52;
    const z = -22.4 - row * 0.5 - Math.floor(row / 5) * 0.25;
    // 小幅尺寸和朝向变化保留石料质感；间距覆盖最大尺寸，避免互相穿插。
    scl.set(0.7 + rand() * 1.2, 0.7 + rand() * 0.6, 0.7 + rand() * 0.8);
    m4.compose(
      new THREE.Vector3(x, 0.08 * scl.y, z),
      q.setFromEuler(new THREE.Euler(0, (rand() - 0.5) * 0.12, 0)),
      scl,
    );
    blocks.setMatrixAt(i, m4);
  }
  blocks.castShadow = true;
  blocks.receiveShadow = true;
  extra.add(blocks);

  /* --- 之字形施工坡道 + 运石雪橇 --- */
  /* --- 剖切观察时的基坑：砂层被揭开后露出的岩体切面，
         让 −30 m 的基岩、下降通道与地下墓室有真实的空间参照 --- */
  const pit = new THREE.Group();
  pit.name = '剖切基坑';
  extra.add(pit);
  const pitMat = new THREE.MeshStandardMaterial({ color: 0x7d6f58, roughness: 1, side: THREE.DoubleSide });
  const rockIn = pitMat;
  const pitW = hole * 2;
  const pitFloor = new THREE.Mesh(new THREE.PlaneGeometry(pitW, pitW), rockIn);
  pitFloor.rotation.x = -Math.PI / 2;
  pitFloor.position.y = -4.6;
  pitFloor.receiveShadow = true;
  pit.add(pitFloor);
  const wallGeo = new THREE.PlaneGeometry(pitW, 4.3);
  for (const sgn of [-1, 1]) {
    const w1 = new THREE.Mesh(wallGeo, rockIn);
    w1.position.set(sgn * hole, -2.47, 0);
    w1.rotation.y = (sgn * Math.PI) / 2;
    pit.add(w1);
    const w2 = new THREE.Mesh(wallGeo, rockIn);
    w2.position.set(0, -2.47, sgn * hole);
    w2.rotation.y = sgn > 0 ? Math.PI : 0;
    pit.add(w2);
  }

  /* --- 施工坡道与运石雪橇已移除（上升节奏难以与砌筑高度严格对齐，
         保留会显得悬浮/穿模）。地面仅保留基岩平台与采石场方料。 --- */
  const rampSlabs: THREE.Mesh[] = [];
  const sleds: { mesh: THREE.Mesh; dist: number; level: number; halfLen: number }[] = [];
  // 施工坡道与运石雪橇已移除：其上升节奏难以与金字塔实际砌筑高度严格对齐，
  // 保留反而会显得“悬浮/穿模”。现在地面仅保留基岩平台与采石场方料。

  return {
    root,
    shell,
    core,
    internals,
    extra,
    capstone,
    coreEdges,
    casingEdges,
    features,
    ground,
    groundPlug,
    plateau,
    rampSlabs,
    sleds,
    coreMat,
    casingMat,
    edgeMat,
    plugMat,
    pitMat,
    plateauMat,
    pit,
    entranceOpening,
    portalGates,
    capCourseFrom: N_CASING - Math.max(1, Math.round(CAP_H / (HEIGHT / N_CASING))),
    coreSys,
    casingSys,
  };
}

/* ------------------------------------------------------------------ 查看器 */

export type ViewerFlags = {
  mode: ViewModeId;
  progress: number;
  playing: boolean;
  speed: number;
  autoCamera: boolean;
  autoRotate: boolean;
  wireframe: boolean;
  showLabels: boolean;
  showEdges: boolean;
  /** 实时接触阴影、环境反射与柔和高光。 */
  rayTracing: boolean;
  renderQuality: RenderQuality;
};

export type LabelInfo = { id: string; name: string; color: string; x: number; y: number; alpha: number };

export type PathKey = { pos: THREE.Vector3; target: THREE.Vector3; dur: number };

export class KhufuViewer {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new THREE.Timer();
  private built: BuiltScene;
  private workers: ReturnType<typeof buildConstructionWorkers>;
  private raf = 0;
  private progress = 0;
  private flags: ViewerFlags = {
    mode: 'translucent',
    progress: 0,
    playing: false,
    speed: 1,
    autoCamera: false,
    autoRotate: false,
    wireframe: false,
    showLabels: true,
    showEdges: true,
    rayTracing: true,
    renderQuality: 'balanced',
  };
  private labelHost: HTMLDivElement | null = null;
  private labelEls = new Map<string, HTMLDivElement>();
  private onProgress?: (p: number) => void;
  /** 点击金字塔进入内部 的回调（由 React 层接管 UI 状态） */
  onEnterRequest?: () => void;
  onExitRequest?: () => void;
  onPlayingChange?: (playing: boolean) => void;
  onCameraControl?: () => void;
  /* --- 进入 / 退出内部的转场状态 --- */
  private phase: 'exterior' | 'interior' = 'exterior';
  private curStation = 0;
  enterT = 0; // 0 = 外壳不透明；1 = 外壳完全淡出（在内部）
  private enterAnim: { from: number; to: number; t: number; dur: number } | null = null;
  private path: PathKey[] | null = null;
  private pathIdx = 0;
  private pathT = 0;
  private pathFromPos = new THREE.Vector3();
  private pathFromTarget = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downPos = { x: 0, y: 0 };
  private hoverEnter = false;
  private focusAnim: { pos: THREE.Vector3; target: THREE.Vector3; fromPos: THREE.Vector3; fromTarget: THREE.Vector3; t: number } | null = null;
  private inputCleanup: (() => void) | null = null;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly autoPosition = new THREE.Vector3();
  private readonly autoTarget = new THREE.Vector3();
  private glbGroup = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private glbDuration = 1;
  private capstoneAllowed = true;
  private todayMode = false;
  private todayExterior: ReturnType<typeof buildTodayExterior> | null = null;
  private pipeline!: KhufuRenderPipeline;
  private environment!: ReturnType<typeof createDesertEnvironment>;
  private beacon!: THREE.Mesh;
  private beaconLight!: THREE.PointLight;
  private beaconPulse = 0;
  private appliedP = -1;
  private uiAcc = 0;
  /** 当前正在施工的内部构件 id（建造信标跟随它；播放时标签只显示它） */
  private activeBuildId: string | null = null;
  /* --- 建造收尾 / 模式切换的平滑淡入淡出（每帧向目标值逼近）
         初值 = 建造起始态，避免开场第一秒出现透明度跳变 --- */
  private casingOpCur = 0.1;
  private coreOpCur = 0.085;
  private emissiveCur = 0.95;
  private plugOpCur = 0;
  private pitOpCur = 1;
  private plateauOpCur = 0;
  private seamOpCur = 0.18;
  private labelOpCur = 1;
  private innerOpCur = 1;
  private innerOpApplied = -1;
  private emissiveApplied = -1;
  private fadeSettled = false;
  private fadeInit = false;
  private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh;
  private headLamp!: THREE.PointLight;
  private ready = false;

  constructor(canvas: HTMLCanvasElement, onProgress?: (p: number) => void) {
    this.canvas = canvas;
    this.onProgress = onProgress;
    this.clock.connect(document);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      // 截图改为 render 完立刻读缓冲，无需 preserveDrawingBuffer（会阻止浏览器丢弃后台缓冲、掉帧）
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // 阴影图只在几何/太阳变化时重绘，静止观景时冻结（观感不变，省掉每帧一次 2048 阴影通道）
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;

    // 窄廊只宽约 1 m，近裁剪面收至 6 cm（模型单位 0.006）。
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.006, 1300);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 260;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.target.set(0, HEIGHT * 0.35, 0);

    this.built = buildModel();
    this.workers = buildConstructionWorkers();
    this.built.extra.add(this.workers.group);
    this.scene.add(this.built.root, this.glbGroup);

    // 内部漫游头灯：跟随相机，仅在钻入塔内时点亮
    this.headLamp = new THREE.PointLight(0xffe2b0, 0, 55, 1.8);
    this.scene.add(this.headLamp);

    // 建造信标：建造过程中在“正在施工的内部结构”前端脉动发光，
    // 明确指示内部结构是如何被一段段开挖 / 一层层砌起的。
    const beaconGeo = new THREE.OctahedronGeometry(0.35);
    this.beacon = new THREE.Mesh(
      beaconGeo,
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95 }),
    );
    this.beacon.visible = false;
    this.beacon.renderOrder = 6;
    this.scene.add(this.beacon);
    this.beaconLight = new THREE.PointLight(0xffb54a, 0, 22, 2);
    this.scene.add(this.beaconLight);

    // 天空
    const skyGeo = new THREE.SphereGeometry(1100, 32, 16);
    this.sky = new THREE.Mesh(
      skyGeo,
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color(0x2b5f96) },
          mid: { value: new THREE.Color(0xa8c4dd) },
          bot: { value: new THREE.Color(0xe6d5b0) },
        },
        vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
        fragmentShader: `
          uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vPos;
          void main(){
            float h = normalize(vPos).y;
            vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.7)) : mix(mid, bot, pow(-h, 0.5));
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.scene.add(this.sky);

    // 光照
    const hemi = new THREE.HemisphereLight(0xcfe3ff, 0xd8bd8c, 0.85);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.35);
    this.sun.position.set(26, 30, 18);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    // 影子取景框要覆盖整座金字塔 + 拉长后的投影，太阳绕动时阴影才能完整转动
    const d = 46;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2.5;
    // 影子朝向塔体中心，随太阳绕动保持对准
    this.sun.target.position.set(0, 6, 0);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    const bounce = new THREE.DirectionalLight(0xffe6b8, 0.35);
    bounce.position.set(-24, 8, -20);
    this.scene.add(bounce);

    this.environment = createDesertEnvironment(this.renderer);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.45;
    this.pipeline = new KhufuRenderPipeline(this.renderer, this.scene, this.camera, this.flags.renderQuality);

    this.autoCameraUpdate(0);
    this.applyMode();
    this.applyProgress(0);
    this.resize();
    this.attachPointer();
    this.loop();
    this.ready = true;
  }

  get isReady() {
    return this.ready;
  }

  /* ------------------------------------------------- 点击金字塔“进入内部” */
  private pickPyramid(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
    this.ray.setFromCamera(this.pointer, this.camera);
    // Hover tests use the compact solid backing, not tens of thousands of worn stones.
    const targets: THREE.Object3D[] = this.todayMode && this.todayExterior
      ? [this.todayExterior.backing]
      : [this.built.shell, this.built.core, this.built.capstone, this.built.internals];
    const hits = this.ray.intersectObjects(targets, true);
    return hits.find((h) => (h.object as THREE.Mesh).isMesh) ?? null;
  }

  /** 只有“把金字塔当实体看”的外部视图里，点击才触发进入内部 */
  private canClickEnter() {
    const m = this.flags.mode;
    return (
      this.phase === 'exterior' &&
      !this.path &&
      (m === 'solid' || m === 'today' || m === 'translucent' || m === 'cut')
    );
  }

  private attachPointer() {
    const onMove = (e: PointerEvent) => {
      if (e.buttons) return;
      if (!this.canClickEnter()) {
        if (this.hoverEnter) {
          this.hoverEnter = false;
          this.canvas.style.cursor = '';
        }
        return;
      }
      const want = !!this.pickPyramid(e.clientX, e.clientY);
      if (want !== this.hoverEnter) {
        this.hoverEnter = want;
        this.canvas.style.cursor = want ? 'pointer' : '';
      }
    };
    const onDown = (e: PointerEvent) => {
      this.downPos = { x: e.clientX, y: e.clientY };
      this.focusAnim = null;
    };
    const onUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y);
      if (e.button !== 0 || moved > 6 || !this.canClickEnter()) return;
      if (!this.pickPyramid(e.clientX, e.clientY)) return;
      this.onEnterRequest?.();
    };
    this.canvas.addEventListener('pointermove', onMove);
    this.canvas.addEventListener('pointerdown', onDown);
    this.canvas.addEventListener('pointerup', onUp);
    const onWheel = () => { this.focusAnim = null; };
    this.canvas.addEventListener('wheel', onWheel, { passive: true });
    this.inputCleanup = () => {
      this.canvas.removeEventListener('pointermove', onMove);
      this.canvas.removeEventListener('pointerdown', onDown);
      this.canvas.removeEventListener('pointerup', onUp);
      this.canvas.removeEventListener('wheel', onWheel);
    };
  }

  /* ------------------------------------------------- 进入 / 退出 / 站点巡检 */
  private vec(p: [number, number, number]) {
    return new THREE.Vector3(p[0] * S, p[1] * S, p[2] * S);
  }

  startPath(keys: PathKey[]) {
    if (this.reducedMotion && keys.length) {
      const last = keys[keys.length - 1];
      this.camera.position.copy(last.pos);
      this.controls.target.copy(last.target);
      this.focusAnim = null;
      this.path = null;
      this.controls.enabled = true;
      return;
    }
    this.path = keys;
    this.pathIdx = 0;
    this.pathT = 0;
    this.pathFromPos.copy(this.camera.position);
    this.pathFromTarget.copy(this.controls.target);
    this.focusAnim = null;
    this.controls.enabled = false;
  }

  private advancePath(dt: number) {
    if (!this.path) return;
    const key = this.path[this.pathIdx];
    this.pathT = Math.min(1, this.pathT + dt / key.dur);
    const k = smooth(this.pathT);
    this.camera.position.lerpVectors(this.pathFromPos, key.pos, k);
    this.controls.target.lerpVectors(this.pathFromTarget, key.target, k);
    if (this.pathT >= 1) {
      this.pathFromPos.copy(key.pos);
      this.pathFromTarget.copy(key.target);
      this.pathIdx++;
      this.pathT = 0;
      if (this.pathIdx >= this.path.length) {
        this.path = null;
        this.controls.enabled = true;
      }
    }
  }

  private animateEnter(to: number, dur = 1.6) {
    if (this.reducedMotion) {
      this.enterT = to;
      this.enterAnim = null;
      this.applyShellFade();
      return;
    }
    this.enterAnim = { from: this.enterT, to, t: 0, dur };
  }

  /** 点击/按钮进入内部：相机先贴到北面入口，再飞入指定站点；外壳同时淡出 */
  enterInterior(station = 0) {
    const st = STATIONS[station] ?? STATIONS[0];
    this.curStation = station;
    this.phase = 'interior';
    this.hoverEnter = false;
    this.canvas.style.cursor = '';
    // 从当前外壳不透明度起淡出（建造中可能是 0.3），避免进入瞬间跳变
    this.enterT = 1 - this.built.casingMat.opacity;
    this.animateEnter(1, 2.3);
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = Math.PI * 0.97;
    this.startPath([
      // 1) 先贴到北面入口外（北面 17 m 高的开凿口），2) 再飞入站点
      { pos: this.vec([30, 23, 150]), target: this.vec([0, 15, 110]), dur: 1.0 },
      { pos: this.vec(st.pos), target: this.vec(st.target), dur: 1.3 },
    ]);
  }

  /** 退回外部总览 */
  exitInterior() {
    this.phase = 'exterior';
    this.animateEnter(0, 1.7);
    this.controls.minDistance = 2;
    this.controls.maxDistance = 260;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.startPath([
      { pos: new THREE.Vector3(13, 10.5, 25), target: new THREE.Vector3(0, 5.5, 0), dur: 1.6 },
    ]);
  }

  /** 在内部站点之间巡检 */
  gotoStation(station: number) {
    const st = STATIONS[station];
    if (!st) return;
    this.curStation = station;
    this.phase = 'interior';
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = Math.PI * 0.97;
    if (this.enterT < 0.99 || this.enterAnim?.to === 0) this.animateEnter(1, 1.2);
    this.startPath([{ pos: this.vec(st.pos), target: this.vec(st.target), dur: 1.15 }]);
  }

  get currentPhase() {
    return this.phase;
  }

  /* --------------------------------------------------------- 状态 */
  setFlags(partial: Partial<ViewerFlags>) {
    const prevMode = this.flags.mode;
    const prevEdges = this.flags.showEdges;
    const prevQuality = this.flags.renderQuality;
    Object.assign(this.flags, partial);
    const modeChanged = partial.mode !== undefined && partial.mode !== prevMode;
    const edgesChanged = partial.showEdges !== undefined && partial.showEdges !== prevEdges;
    if (modeChanged || edgesChanged) this.applyMode();
    if (partial.wireframe !== undefined) {
      const wf = partial.wireframe;
      this.built.casingMat.wireframe = wf;
      this.built.coreMat.wireframe = wf;
      this.built.coreSys.fillMaterial.wireframe = wf;
      this.built.casingSys.fillMaterial.wireframe = wf;
      this.todayExterior?.materials.forEach((material) => { material.wireframe = wf; });
    }
    if (partial.showLabels !== undefined && this.labelHost) {
      this.labelHost.style.opacity = partial.showLabels ? '1' : '0';
    }
    if (partial.autoRotate !== undefined) {
      this.controls.autoRotate = partial.autoRotate;
      this.controls.autoRotateSpeed = 0.6;
    }
    if (partial.rayTracing !== undefined) this.setRayTracing(partial.rayTracing);
    if (partial.renderQuality && partial.renderQuality !== prevQuality) {
      this.pipeline.setQuality(partial.renderQuality);
      const shadowSize = partial.renderQuality === 'quality' ? 4096 : partial.renderQuality === 'performance' ? 1024 : 2048;
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.renderer.shadowMap.needsUpdate = true;
    }
    // React 的 progress 是节流后的显示值；用户跳转通过 setProgress 显式发送，
    // 避免暂停、切换画质或标签时把动画倒退到上一条 UI 报告。
  }

  setProgress(p: number) {
    this.progress = clamp01(p);
    this.applyProgress(this.progress);
  }

  /** 建造信标：定位到“正在施工”的内部构件（环框/构件）前端并脉动发光 */
  private updateConstructionBeacon(dt: number) {
    this.beaconPulse += dt;
    const building =
      this.progress < 0.985 &&
      this.flags.mode !== 'inside' &&
      this.built.internals.visible;
    if (!building) {
      this.beacon.visible = false;
      this.beaconLight.intensity *= 0.85;
      this.activeBuildId = null;
      return;
    }
    // 在全部内部构件的“施工窗口”里，找当前正在砌的那一个
    let best: Growth | null = null;
    let bestLocal = 0;
    let bestId: string | null = null;
    for (const f of this.built.features) {
      for (const g of f.growth) {
        if (g.obj.userData.isEdge) continue;
        const local = smooth((this.progress - g.t0) / Math.max(0.001, g.t1 - g.t0));
        if (this.progress >= g.t0 && this.progress < g.t1 && local > 0.02 && local < 0.98) {
          if (!best || g.t0 > best.t0) {
            best = g;
            bestLocal = local;
            bestId = f.id;
          }
        }
      }
    }
    this.activeBuildId = bestId;
    if (!best) {
      this.beacon.visible = false;
      this.beaconLight.intensity *= 0.85;
      return;
    }
    const m = best.obj as THREE.Mesh;
    const axis = best.axis;
    const front = new THREE.Vector3();
    if (m.geometry) {
      (m.geometry as THREE.BufferGeometry).computeBoundingBox();
      const bb = (m.geometry as THREE.BufferGeometry).boundingBox!;
      if (axis === 'z') {
        const len = bb.max.z - bb.min.z;
        const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion);
        front.copy(m.position).addScaledVector(dir, len * bestLocal);
      } else if (axis === 'pop') {
        front.copy(m.position);
      } else {
        const h = bb.max.y - bb.min.y;
        front.copy(m.position).add(new THREE.Vector3(0, (h / 2) * bestLocal, 0));
      }
    } else {
      front.copy(m.position);
    }
    this.beacon.position.copy(front);
    const pulse = 0.65 + 0.35 * Math.sin(this.beaconPulse * 6);
    this.beacon.scale.setScalar(pulse * 1.05);
    this.beacon.visible = true;
    this.beaconLight.position.copy(front);
    this.beaconLight.intensity += (4.5 * pulse - this.beaconLight.intensity) * Math.min(1, dt * 6);
  }

  /** 外壳随进入/退出转场淡入淡出；enterT = 1 时完全不可见 */
  private applyShellFade() {
    const vis = this.enterT < 0.985 && this.flags.mode !== 'interior';
    this.built.shell.visible = vis;
    this.built.casingMat.opacity = Math.max(0, 1 - this.enterT);
    // Keep one compositing path during the whole fade, including opacity=1.
    this.built.casingMat.transparent = true;
    this.built.casingMat.depthWrite = true;
    this.built.casingSys.insts.forEach((m) => (m.castShadow = this.enterT < 0.5));
    this.built.casingSys.fills.forEach((m) => (m.castShadow = this.enterT < 0.5));
    this.built.casingEdges.visible = false;
    this.renderer.shadowMap.needsUpdate = true;
  }

  private applyMode() {
    const { mode } = this.flags;
    // 保留 x<0 与 z<0 的部分 → 切去东北象限（与 Blender 工程里的剖切方块一致）
    const clip = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const clip2 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const cut = mode === 'cut';
    const inside = mode === 'inside';
    this.built.coreMat.clippingPlanes = cut ? [clip, clip2] : [];
    this.built.casingMat.clippingPlanes = cut ? [clip, clip2] : [];
    this.built.coreSys.fillMaterial.clippingPlanes = cut ? [clip, clip2] : [];
    this.built.casingSys.fillMaterial.clippingPlanes = cut ? [clip, clip2] : [];
    this.built.coreSys.fillMaterial.needsUpdate = true;
    this.built.casingSys.fillMaterial.needsUpdate = true;
    this.built.coreMat.needsUpdate = true;
    this.built.casingMat.needsUpdate = true;

    // 外壳组显隐（进入内部时由 enterT 转场接管）
    if (mode === 'today' && !this.todayExterior) {
      this.todayExterior = buildTodayExterior();
      this.todayExterior.materials.forEach((material) => { material.wireframe = this.flags.wireframe; });
      this.built.root.add(this.todayExterior.group);
    }
    if (this.todayExterior) this.todayExterior.group.visible = mode === 'today';
    this.built.shell.visible = mode !== 'interior' && mode !== 'today';
    if (inside) {
      this.built.shell.visible = this.enterT < 0.985;
      this.built.casingMat.opacity = Math.max(0, 1 - this.enterT);
      this.built.casingMat.transparent = true;
    } else if (this.fadeInit) {
      // 从当前外壳不透明度起继续淡入淡出，避免模式切换瞬间跳变
      this.casingOpCur = this.built.casingMat.opacity;
      this.enterT = 0;
    } else {
      this.enterT = 0;
    }
    this.fadeInit = true;
    this.built.casingEdges.visible = false;
    this.built.coreEdges.visible = false;

    // 地面组显隐；补块 / 基坑 / 平台的具体淡入淡出由 updateFinishFade 驱动
    this.built.extra.visible = mode !== 'interior';
    const quarry = this.built.extra.getObjectByName('施工场待用石料');
    if (quarry) quarry.visible = mode !== 'today';
    // 内部漫游时收掉施工坡道，避免在内部视角里横穿画面
    this.built.rampSlabs.forEach((r) => (r.userData.hidden = inside));

    // 顶石（今日现状：无顶石）
    this.capstoneAllowed = mode !== 'today' && mode !== 'interior' && !inside;
    this.todayMode = mode === 'today';
    if (this.sun) this.sun.castShadow = !inside;

    // 透明度 / 可见性 / 阴影 / 标签全部交给 updateFinishFade 每帧平滑逼近
    this.fadeSettled = false;
    this.appliedP = -1;
    this.applyProgress(this.progress);
  }

  /**
   * 建造收尾 + 模式切换的平滑过渡：
   * 外壳 / 石核 / 自发光 / 地面补块 / 基坑 / 石缝 / 标签整体向目标值淡入淡出，
   * 建造结尾从“透视结构”渐变为“完整外观”，不再生硬一刀切。
   * 关键：内部结构永远先画、外壳盖在上面混合 → 外壳变不透明时自然盖住内部。
   */
  private updateFinishFade(dt: number) {
    const { mode } = this.flags;
    const p = this.progress;
    const translucent = mode === 'translucent';
    const inside = mode === 'inside';
    const cut = mode === 'cut';
    const interior = mode === 'interior';
    /** X 光类观察模式：恒定「看穿」，不参与建造收尾的封顶渐变 */
    const xray = translucent || cut || interior || inside;

    // ── 建造收尾「封顶」渐变：0 = 建造中（看穿内部），1 = 完整外观。
    //    由时间轴连续驱动（0.88 → 1.0，约占 12% 时长），而不是某一帧的阈值突变，
    //    所以外壳会像真的一层层封起来那样丝滑地变实，而非硬切。
    const seal = xray ? 0 : mode === 'today' ? 1 : smooth((p - 0.88) / 0.12);
    const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

    /* 建造期的「看穿」参数：外壳/石核由许多层砌块 + 实心棱台叠加，
       alpha 会累乘，0.3 实测叠完接近全不透明 → 内部被糊住。
       这里把单层压到 0.10 左右，并改用 FrontSide（剔除背面，层数直接减半）。 */
    const BUILD_CASING = 0.1;
    const BUILD_CORE = 0.085;
    const BUILD_EMIS = 0.95; // 内部自发光加强，穿透外壳更清晰

    let casingT: number;
    let coreT: number;
    let emisT: number;
    let seamT: number;
    let innerT: number; // 内部结构整体不透明度（1 = 完全显示）
    if (translucent) {
      casingT = 0.12;
      coreT = 0.055;
      emisT = 0.45;
      seamT = 0.18;
      innerT = 1;
    } else if (cut || interior) {
      casingT = 1;
      coreT = 1;
      emisT = 0.2;
      seamT = 0.5;
      innerT = 1;
    } else if (inside) {
      casingT = this.casingOpCur; // 由 enterT 转场驱动
      coreT = 0.09;
      emisT = 0.2;
      seamT = 0.18;
      innerT = 1;
    } else {
      // solid / today：随封顶渐变从「看穿」过渡到「完整外观」
      casingT = lerpN(BUILD_CASING, 1, seal);
      coreT = lerpN(BUILD_CORE, 1, seal);
      emisT = lerpN(BUILD_EMIS, 0.16, seal);
      seamT = lerpN(0.18, 0.5, seal);
      innerT = 1 - seal;
    }
    const plugT = xray ? 0 : seal; // 地面补块随封顶一起合拢
    const labelT = this.flags.showLabels ? innerT : 0;

    // 缓动跟随（用于手动切换模式；封顶渐变本身已由时间轴平滑驱动）
    const k = 1 - Math.exp(-dt * (this.reducedMotion ? 18 : 3.4));
    const stepTo = (cur: number, t: number) => {
      const n = cur + (t - cur) * k;
      return Math.abs(n - t) < 0.0001 ? t : n;
    };
    if (!inside) this.casingOpCur = stepTo(this.casingOpCur, casingT);
    this.coreOpCur = stepTo(this.coreOpCur, coreT);
    this.emissiveCur = stepTo(this.emissiveCur, emisT);
    this.plugOpCur = stepTo(this.plugOpCur, plugT);
    this.pitOpCur = stepTo(this.pitOpCur, 1 - plugT);
    this.plateauOpCur = stepTo(this.plateauOpCur, plugT);
    this.seamOpCur = stepTo(this.seamOpCur, seamT);
    this.labelOpCur = stepTo(this.labelOpCur, labelT);
    this.innerOpCur = stepTo(this.innerOpCur, innerT);

    const settled =
      (inside || this.casingOpCur === casingT) &&
      this.coreOpCur === coreT &&
      this.innerOpCur === innerT &&
      this.plugOpCur === plugT;

    // 始终沿用透明合成队列和深度写入。透明度达到 1 的最后一帧不再
    // 突然重排为不透明物体；砌块与实体填充保持同层，避免交叠面突然跳变。
    const shellSide = THREE.FrontSide;

    if (!inside) {
      this.built.casingMat.opacity = this.casingOpCur;
      this.built.casingMat.transparent = true;
      this.built.casingMat.depthWrite = true;
      this.built.casingMat.side = shellSide;
      this.built.casingSys.insts.forEach((m) => (m.renderOrder = 2));
      this.built.casingSys.fills.forEach((m) => (m.renderOrder = 2));
      this.built.capstone.renderOrder = 3;
    }
    this.built.coreMat.opacity = this.coreOpCur;
    this.built.coreMat.transparent = true;
    this.built.coreMat.depthWrite = true;
    this.built.coreMat.side = shellSide;
    this.built.coreSys.insts.forEach((m) => (m.renderOrder = 1));
    this.built.coreSys.fills.forEach((m) => (m.renderOrder = 1));
    // Fade the capped internal mass later than its surface. At ghost opacity,
    // even dozens of course caps remain optically clear; the final value is 1.
    this.built.coreSys.fillMaterial.opacity = Math.pow(this.coreOpCur, 6);
    this.built.casingSys.fillMaterial.opacity = Math.pow(this.built.casingMat.opacity, 6);

    this.built.casingSys.seams.forEach((m) => {
      m.renderOrder = 4;
      (m.material as THREE.MeshBasicMaterial).opacity = this.seamOpCur;
    });

    // 内部结构：自发光 + 整体不透明度一起渐变（封顶时内部自然淡出，
    // 连穿出塔面的通风井端头也一并隐去，最终外观干干净净）
    if (
      Math.abs(this.innerOpCur - this.innerOpApplied) > 0.002 ||
      Math.abs(this.emissiveCur - this.emissiveApplied) > 0.002
    ) {
      this.innerOpApplied = this.innerOpCur;
      this.emissiveApplied = this.emissiveCur;
      const io = this.innerOpCur;
      this.built.features.forEach((f) => {
        f.meshes.forEach((m) => {
          const mat = m.material as THREE.MeshStandardMaterial;
          if (!mat) return;
          if (mat.emissive) mat.emissiveIntensity = this.emissiveCur;
          mat.opacity = io;
          mat.transparent = true;
          mat.depthWrite = true;
        });
      });
    }
    this.built.internals.visible = this.innerOpCur > 0.01;

    // 地面：补块 / 基坑 / 平台交叉淡入淡出
    const plug = this.built.plugMat;
    plug.opacity = this.plugOpCur;
    plug.transparent = true;
    plug.depthWrite = true;
    const pitM = this.built.pitMat;
    pitM.opacity = this.pitOpCur;
    pitM.transparent = true;
    pitM.depthWrite = true;
    const platM = this.built.plateauMat;
    platM.opacity = this.plateauOpCur;
    platM.transparent = true;
    platM.depthWrite = true;
    this.built.groundPlug.visible = this.plugOpCur > 0.02;
    this.built.pit.visible = this.pitOpCur > 0.02;
    this.built.plateau.visible = this.plateauOpCur > 0.02;

    // 阴影：外部视角（含建造中）始终投影，太阳绕动时地面阴影才会跟着转；
    // X 光研究模式关闭，避免整片阴影把内部压黑
    const shadowsOn = !inside && !interior && !translucent && !cut;
    this.built.casingSys.insts.forEach((m) => (m.castShadow = shadowsOn));
    this.built.casingSys.fills.forEach((m) => (m.castShadow = shadowsOn));
    this.built.coreSys.insts.forEach((m) => (m.castShadow = shadowsOn));
    this.built.coreSys.fills.forEach((m) => (m.castShadow = shadowsOn));

    if (this.labelHost) this.labelHost.style.opacity = String(this.labelOpCur);
    if (settled !== this.fadeSettled) {
      this.fadeSettled = settled;
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  private applyProgress(p: number) {
    // 内部漫游时始终呈现“已建成”状态，避免时间轴把墓室抽走
    if (this.flags.mode === 'inside') p = 1;
    p = clamp01(p);
    if (Math.abs(p - this.appliedP) < 1e-6) {
      this.progress = p;
      return;
    }
    this.appliedP = p;
    this.progress = p;
    this.workers.update(p, this.flags.playing, this.flags.mode);
    this.renderer.shadowMap.needsUpdate = true;

    // 石核显隐；透明度统一由 updateFinishFade 平滑驱动（这里不再直接赋值，避免打架）
    const coreOn = this.flags.mode !== 'interior' && !this.todayMode;
    this.built.core.visible = coreOn;

    // 顶石就位后，它覆盖的顶部砌层不再绘制，
    // 否则白色的塔尖会从金色顶石里戳出来（这是“金色被白色挡住”的根因）
    const capOn = this.capstoneAllowed && p > 0.915;
    const capFrom = this.built.capCourseFrom;
    const keepCasing = (c: number) => {
      if (this.todayMode) return false; // 今日遗存由独立风化石核呈现。
      if (capOn && c >= capFrom) return false;
      return true;
    };
    const keepCore = (c: number) => !(capOn && c >= capFrom);

    // 石核：逐块砌石（自下而上）
    updateBlocks(this.built.coreSys, p, keepCore);
    this.built.coreEdges.visible = false;

    // 外壳：逐块砌石（自上而下倒铺）
    updateBlocks(this.built.casingSys, p, keepCasing);
    // “层线”开关现在控制贴合外壳表面的细石缝，而非粗重的横向线框。
    const seamOn = this.flags.showEdges && this.flags.mode !== 'inside' && this.flags.mode !== 'interior';
    this.built.casingSys.seams.forEach((s, i) => {
      const built = p >= this.built.casingSys.fillStarts[i] + this.built.casingSys.fillDur * 0.55;
      s.visible = seamOn && built && keepCasing(i);
    });
    this.built.casingEdges.visible = false;

    // 入口凿口 / 人字过梁：等所在砌层砌好后再“凿出”，避免悬在空中
    this.built.portalGates.forEach(({ obj, course }) => {
      const built = p >= this.built.casingSys.fillStarts[course] + this.built.casingSys.fillDur;
      obj.visible = built && this.built.shell.visible && !this.todayMode;
    });

    // 顶石：自高空吊装就位
    const cp = clamp01((p - 0.92) / 0.045);
    this.built.capstone.scale.setScalar(Math.max(0.001, smooth(cp)));
    this.built.capstone.position.y =
      ((this.built.capstone.userData.baseY as number) ?? CAPSTONE_Y) + 2.6 * (1 - smooth(cp));
    this.built.capstone.visible = this.capstoneAllowed && this.built.shell.visible && p > 0.915;

    // 内部结构：石砌环框隧道逐圈砌成；墓室构件依次落位；盒子沿高度升起
    for (const f of this.built.features) {
      const t0: number = f.growth[0]?.t0 ?? f.group.userData.t0 ?? 0;
      f.group.visible = p >= t0;
      for (const g of f.growth) {
        const local = smooth((p - g.t0) / Math.max(0.01, g.t1 - g.t0));
        const prev = g.obj.userData._sc as number | undefined;
        if (prev !== undefined && ((local >= 0.999 && prev >= 0.999) || (local <= 0 && prev <= 0))) continue;
        g.obj.userData._sc = local;
        if (g.axis === 'z') {
          g.obj.scale.set(1, 1, Math.max(0.001, local)); // 沿通道方向推进
        } else if (g.axis === 'pop') {
          g.obj.scale.setScalar(Math.max(0.001, local)); // 石环框整圈“砌成”
        } else {
          g.obj.scale.set(0.75 + 0.25 * local, Math.max(0.001, local), 0.75 + 0.25 * local);
        }
      }
    }

    // 外部 GLB
    if (this.mixer) {
      this.mixer.setTime(this.progress * this.glbDuration);
    }
  }

  /* --------------------------------------------------------- 标签 */
  attachLabels(host: HTMLDivElement) {
    this.labelHost = host;
    host.innerHTML = '';
    // 整体透明度由 updateFinishFade 每帧驱动，不需要 CSS 过渡（避免双重延迟）
    host.style.transition = 'none';
    for (const f of FEATURES) {
      const el = document.createElement('div');
      el.className = 'kh-label';
      el.style.cssText = `position:absolute;left:0;top:0;transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer;
        display:flex;align-items:center;gap:6px;padding:3px 9px;border-radius:9999px;white-space:nowrap;
        font:600 11px/1.4 "Helvetica Neue",Arial,sans-serif;letter-spacing:.02em;
        background:rgba(12,16,24,.72);border:1px solid ${f.color};color:#eef4ff;backdrop-filter:blur(6px);`;
      el.innerHTML = `<span style="width:6px;height:6px;border-radius:9999px;background:${f.color};box-shadow:0 0 8px ${f.color}"></span>${f.name}`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.focusFeature(f.id);
      });
      host.appendChild(el);
      this.labelEls.set(f.id, el);
    }
  }

  focusFeature(id: string) {
    const f = FEATURES.find((x) => x.id === id);
    if (!f) return;
    const target = new THREE.Vector3(f.anchor[0] * S, f.anchor[1] * S, f.anchor[2] * S);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const pos = target.clone().add(dir.multiplyScalar(this.phase === 'interior' ? 2.4 : 5.5));
    this.focusCamera(pos, target);
  }

  /* --------------------------------------------------------- 相机机位 */
  cameraPreset(az: number, el: number, dist: number, targetY: number) {
    const azr = (az * Math.PI) / 180;
    const elr = (el * Math.PI) / 180;
    const pos = new THREE.Vector3(
      dist * Math.cos(elr) * Math.sin(azr),
      targetY + dist * Math.sin(elr),
      dist * Math.cos(elr) * Math.cos(azr),
    );
    this.focusCamera(pos, new THREE.Vector3(0, targetY, 0));
  }

  private focusCamera(pos: THREE.Vector3, target: THREE.Vector3) {
    this.flags.autoCamera = false;
    this.flags.autoRotate = false;
    this.controls.autoRotate = false;
    this.onCameraControl?.();
    if (this.reducedMotion) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.focusAnim = null;
      return;
    }
    this.focusAnim = {
      pos, target,
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      t: 0,
    };
  }

  resetCamera() {
    // 内部漫游时“复位”回到当前站点，而不是飞出塔外
    if (this.phase === 'interior') {
      this.gotoStation(this.curStation);
      return;
    }
    this.cameraPreset(46, 22, 40, HEIGHT * 0.4);
  }

  focusConstructionSite() {
    this.focusCamera(new THREE.Vector3(8, 1.7, 20), new THREE.Vector3(4, 0, 16.2));
  }

  private autoCameraUpdate(p: number, dt = 0) {
    const steps = STEPS;
    let a = steps[0];
    let b = steps[steps.length - 1];
    for (let i = 0; i < steps.length; i++) {
      if (p >= steps[i].from) a = steps[i];
      if (p < steps[i].from) {
        b = steps[i];
        break;
      }
    }
    const span = Math.max(0.0001, b.from - a.from);
    const t = smooth(clamp01((p - a.from) / span));
    const az = a.cam.az + (b.cam.az - a.cam.az) * t;
    const el = a.cam.el + (b.cam.el - a.cam.el) * t;
    const framing = Math.max(1.08, 1.2 / this.camera.aspect);
    const dist = (a.cam.dist + (b.cam.dist - a.cam.dist) * t) * framing;
    const tx = (a.cam.target[0] + (b.cam.target[0] - a.cam.target[0]) * t) * S;
    const ty = (a.cam.target[1] + (b.cam.target[1] - a.cam.target[1]) * t) * S;
    const tz = (a.cam.target[2] + (b.cam.target[2] - a.cam.target[2]) * t) * S;
    const azr = (az * Math.PI) / 180;
    const elr = (el * Math.PI) / 180;
    this.autoPosition.set(tx + dist * Math.cos(elr) * Math.sin(azr), ty + dist * Math.sin(elr), tz + dist * Math.cos(elr) * Math.cos(azr));
    this.autoTarget.set(tx, ty, tz);
    const follow = dt > 0 ? 1 - Math.exp(-dt * 7) : 1;
    this.camera.position.lerp(this.autoPosition, follow);
    this.controls.target.lerp(this.autoTarget, follow);
  }

  /* --------------------------------------------------------- 循环 */
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    // 后台标签和调试暂停不应让建造过程突然跳过数个工序。
    this.clock.update();
    const elapsed = this.clock.getDelta();
    if (document.hidden) return;
    const dt = Math.min(elapsed, 0.05);

    if (this.flags.playing) {
      const next = this.progress + (dt * this.flags.speed) / 24;
      if (next >= 1) {
        this.setProgress(1);
        this.flags.playing = false;
        this.onProgress?.(1);
        this.onPlayingChange?.(false);
      } else {
        this.setProgress(next);
        this.uiAcc += dt;
        if (this.uiAcc >= 0.08) {
          this.uiAcc = 0;
          this.onProgress?.(this.progress);
        }
      }
    }
    if (this.mixer) this.mixer.setTime(this.progress * this.glbDuration);

    // 进入 / 退出转场：外壳淡入淡出 + 相机分段飞行
    if (this.enterAnim) {
      this.enterAnim.t = Math.min(1, this.enterAnim.t + dt / this.enterAnim.dur);
      const a = this.enterAnim;
      this.enterT = a.from + (a.to - a.from) * smooth(a.t);
      this.applyShellFade();
      if (a.t >= 1) this.enterAnim = null;
    }
    this.advancePath(dt);

    if (this.path) {
      /* 转场飞行期间不接受自动运镜 */
    } else if (this.flags.autoCamera) {
      this.autoCameraUpdate(this.progress, dt);
    } else if (this.focusAnim) {
      const fa = this.focusAnim;
      fa.t = Math.min(1, fa.t + dt / 0.85);
      const k = smooth(fa.t);
      this.camera.position.lerpVectors(fa.fromPos, fa.pos, k);
      this.controls.target.lerpVectors(fa.fromTarget, fa.target, k);
      if (fa.t >= 1) this.focusAnim = null;
    }

    // 太阳随建造进程绕塔心移动：方位角 + 高度角同步变化，
    // 使金字塔投影随之转动、拉长、缩短（运镜中阴影真实地“跟着光线走”）
    {
      const t = this.progress;
      const az = THREE.MathUtils.lerp(-1.15, 1.15, t); // 方位角：从早到晚扫过约 132°
      const el = 0.46 + 0.4 * Math.sin(t * Math.PI); // 高度角：正午（中期）最高
      const R = 78;
      this.sun.position.set(
        Math.sin(az) * Math.cos(el) * R,
        Math.sin(el) * R + 6,
        Math.cos(az) * Math.cos(el) * R,
      );
    }

    // 头灯：仅内部漫游阶段渐亮，照亮 1 m 宽的深通道
    // 模型按 1:10 缩放，米宽窄廊的墙面只距灯数厘米场景单位；
    // 避免沿用室外强度导致逆平方衰减后的近墙高光完全过曝。
    const narrowPassage = [0, 1, 3, 9].includes(this.curStation);
    const lampTarget = this.phase === 'interior' ? (narrowPassage ? 0.045 : 0.65) : 0;
    this.headLamp.intensity += (lampTarget - this.headLamp.intensity) * (1 - Math.exp(-dt * 3.2));
    this.headLamp.position.copy(this.camera.position);
    // 建造信标：标记内部结构正在施工的位置
    this.updateConstructionBeacon(dt);
    // 收尾 / 模式切换淡入淡出（必须在渲染前更新）
    this.updateFinishFade(dt);

    this.controls.dampingFactor = 1 - Math.exp(-dt * 4.35);
    this.controls.update(dt);
    this.renderFrame();
    this.updateLabels();
  };

  /** 内部与剖切视图保留清楚的结构配色，外观启用接触阴影。 */
  private renderFrame() {
    const { mode } = this.flags;
    const interior = mode === 'inside' || mode === 'interior';
    this.pipeline.render({
      enhanced: this.flags.rayTracing && !interior,
      // GTAO only acquires the exterior silhouette at 0.99 opacity. Fade its
      // contribution after that point instead of exposing a new shadow at once.
      ambientOcclusion: mode === 'cut' || mode === 'translucent' ? 0
        : mode === 'today' ? 1 : smooth((Math.min(this.built.casingSys.fillMaterial.opacity, this.built.coreSys.fillMaterial.opacity) - 0.99) / 0.01),
    });
  }

  private updateLabels() {
    if (!this.labelHost || this.labelHost.style.opacity === '0') return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    // 建造演示播放中：只显示“当前正在施工”的那一个构件标签，其余全部隐藏，
    // 避免十几个名称堆在画面中央挡住建造过程；暂停后恢复显示全部。
    const demoSolo =
      this.flags.playing &&
      this.progress < 0.985 &&
      this.built.internals.visible &&
      this.flags.mode !== 'inside' &&
      this.flags.mode !== 'interior';
    for (const f of FEATURES) {
      const el = this.labelEls.get(f.id);
      if (!el) continue;
      const isSoloActive = demoSolo && f.id === this.activeBuildId;
      // 演示中，当前施工标签跟随建造信标（施工前端），而不是固定锚点
      const src =
        isSoloActive && this.beacon.visible
          ? this.beacon.position.clone()
          : new THREE.Vector3(f.anchor[0] * S, f.anchor[1] * S, f.anchor[2] * S);
      const camDist = src.distanceTo(this.camera.position);
      src.project(this.camera);
      const x = (src.x * 0.5 + 0.5) * w;
      const y = (-src.y * 0.5 + 0.5) * h;
      const behind = src.z > 1;
      const feat = this.built.features.find((x) => x.id === f.id);
      const show =
        !behind &&
        !!feat?.group.visible &&
        !!this.built.internals.visible &&
        this.flags.showLabels &&
        camDist < 150 &&
        (!demoSolo || isSoloActive);
      el.style.opacity = show ? '1' : '0';
      el.style.pointerEvents = show ? 'auto' : 'none';
      if (isSoloActive && show) {
        // 浮在施工点上方，不盖住信标和正在砌的石环
        el.style.transform = `translate(-50%,-190%) translate(${x}px,${y}px) scale(1.08)`;
        el.style.zIndex = '2000';
        el.style.boxShadow = `0 0 14px ${f.color}`;
      } else {
        el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px)`;
        el.style.zIndex = String(Math.round(1000 - camDist));
        el.style.boxShadow = '';
      }
    }
  }

  /* --------------------------------------------------------- 资源 / 导出 */
  screenshot() {
    this.renderFrame();
    return this.canvas.toDataURL('image/png');
  }

  async loadGLB(file: File) {
    const buf = await file.arrayBuffer();
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(buf, '');
    this.glbGroup.clear();
    this.glbGroup.add(gltf.scene);
    this.mixer = new THREE.AnimationMixer(gltf.scene);
    for (const clip of gltf.animations) {
      this.mixer.clipAction(clip).play();
    }
    this.glbDuration = gltf.animations.length ? Math.max(...gltf.animations.map((c) => c.duration)) : 1;
    this.glbGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    this.built.root.visible = false;
    if (this.labelHost) this.labelHost.style.opacity = '0';
    // 自动取景
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());
    this.controls.target.copy(center);
    this.camera.position.copy(center.clone().add(new THREE.Vector3(size * 0.7, size * 0.5, size * 0.7)));
    this.mixer.setTime(0);
    return { duration: this.glbDuration, clips: gltf.animations.map((c) => c.name) };
  }

  clearGLB() {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.glbGroup.clear();
    this.built.root.visible = true;
    if (this.labelHost) this.labelHost.style.opacity = this.flags.showLabels ? '1' : '0';
    this.applyMode();
  }

  get hasGLB() {
    return this.glbGroup.children.length > 0;
  }

  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pipeline?.resize(w, h);
  }

  /** 开关实时接触阴影和高光后处理。 */
  setRayTracing(on: boolean) {
    this.flags.rayTracing = on;
  }

  setPlaying(playing: boolean, speed: number) {
    this.flags.playing = playing && this.flags.mode !== 'inside';
    this.flags.speed = speed;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.clock.dispose();
    this.inputCleanup?.();
    this.controls.dispose();
    this.mixer?.stopAllAction();
    this.pipeline?.dispose();
    this.environment?.dispose();
    this.sun.shadow.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) geometries.add(m.geometry);
      if (m.material) {
        for (const material of Array.isArray(m.material) ? m.material : [m.material]) {
          materials.add(material);
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) textures.add(value);
          }
        }
      }
      if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    this.labelHost?.replaceChildren();
    this.labelEls.clear();
    this.renderer.dispose();
  }
}
