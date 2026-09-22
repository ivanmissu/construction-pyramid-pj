import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createStoneTexture } from './stoneTexture';

const HALF_BASE = 11.5165;
const ORIGINAL_HEIGHT = 14.66;
const PRESENT_HEIGHT = 13.75;
const COURSE_COUNT = 203;
const PATCH_VARIANTS = 6;

function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Three neighbouring stones share an instance, but retain separate worn edges and joints. */
function weatheredStonePatch(variant: number) {
  const stones: THREE.BufferGeometry[] = [];
  const random = seededRandom(861 + variant * 107);
  for (let stone = 0; stone < 3; stone++) {
    const geometry = new THREE.BoxGeometry(1, 1, 1, 2, 1, 1);
    const positions = geometry.getAttribute('position');
    const colors: number[] = [];
    const shade = 0.87 + random() * 0.2;
    // Identical box corners must receive identical displacement on every adjoining face.
    const corners = new Map<string, THREE.Vector3>();
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const x = positions.getX(vertex);
      const y = positions.getY(vertex);
      const z = positions.getZ(vertex);
      const key = `${x},${y},${z}`;
      let point = corners.get(key);
      if (!point) {
        point = new THREE.Vector3(
          x * (0.966 - random() * 0.018),
          y * (0.94 + random() * 0.055),
          z * (0.88 + random() * 0.11),
        );
        // An intermediate vertex breaks long ruler-straight edges into small chips.
        if (x === 0) point.y *= 0.91 + random() * 0.08;
        corners.set(key, point);
      }
      positions.setXYZ(vertex, (point.x + stone - 1) / 3, point.y, point.z);
      colors.push(shade, shade * (0.99 + stone * 0.004), shade * 0.974);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    stones.push(geometry);
  }
  const geometry = mergeGeometries(stones)!;
  stones.forEach((stone) => stone.dispose());
  geometry.name = `Weathered limestone patch ${variant + 1}`;
  return geometry;
}

type StonePatch = { matrix: THREE.Matrix4; color: THREE.Color };

/**
 * Present-day Khufu: exposed, weathered core masonry and a missing summit.
 * This is a visual reconstruction, not a survey of the individual surviving blocks.
 * Unlike Khafre, Khufu does not retain a polished white cap at its summit.
 */
export function buildTodayExterior() {
  const group = new THREE.Group();
  group.name = '胡夫金字塔今日现状 · 风化石核';
  const blocks = new THREE.Group();
  blocks.name = '现存石灰岩砌体';
  group.add(blocks);
  const random = seededRandom(19031883);
  const grain = createStoneTexture();
  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: 0xc5b18c,
    roughness: 1,
    metalness: 0,
    bumpMap: grain,
    bumpScale: 0.014,
    roughnessMap: grain,
    vertexColors: true,
  });
  stoneMaterial.name = 'Exposed weathered limestone';
  const backingMaterial = new THREE.MeshStandardMaterial({
    color: 0xa99777,
    roughness: 1,
    metalness: 0,
    bumpMap: grain,
    bumpScale: 0.009,
  });
  backingMaterial.name = 'Recessed solid masonry';

  // Preserve the existing measured slope, truncating its missing upper portion.
  // The first courses are taller; irregular bands recur up the exposed masonry.
  const rawHeights = Array.from({ length: COURSE_COUNT }, (_, course) =>
    course === 0 ? 0.145 : course === 1 ? 0.117 :
      0.057 + random() * 0.027 + Math.sin(course * 0.41) * 0.01 +
      (course % 29 === 18 ? 0.028 : 0));
  const heightScale = PRESENT_HEIGHT / rawHeights.reduce((sum, height) => sum + height, 0);
  const courseHeights = rawHeights.map((height) => height * heightScale);
  const radiusAt = (y: number) => HALF_BASE * (1 - y / ORIGINAL_HEIGHT);
  const matrices: StonePatch[][] = Array.from({ length: PATCH_VARIANTS }, () => []);
  const backing = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), backingMaterial, COURSE_COUNT);
  backing.name = '连续实心砌体 · 不透空的石缝';
  backing.castShadow = backing.receiveShadow = true;
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  let y = 0;

  for (let course = 0; course < COURSE_COUNT; course++) {
    const height = courseHeights[course];
    const radius = radiusAt(y + height * 0.65) - 0.012;
    const stoneDepth = 0.145;
    // Backing overlaps the rear of the stone faces and fills the entire course.
    // Its uninterrupted top also forms the surviving flat summit.
    const backingRadius = Math.max(0.22, radius - 0.105);
    matrix.compose(position.set(0, y + height / 2, 0), quaternion.identity(), scale.set(backingRadius * 2, height, backingRadius * 2));
    backing.setMatrixAt(course, matrix);

    for (let face = 0; face < 4; face++) {
      const angle = face * Math.PI / 2;
      quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
      // A variable first stone, and unequal patch widths, prevent aligned vertical seams.
      let cursor = -radius;
      let patch = 0;
      while (cursor < radius - 0.001) {
        const nominalWidth = patch === 0 ? 0.27 + random() * 0.37 : 0.58 + random() * 0.24;
        const width = Math.min(nominalWidth, radius - cursor);
        const alongFace = cursor + width / 2;
        const centerDent = 0.058 * (1 - Math.abs(alongFace / radius));
        const erosion = random() * 0.018;
        const outward = radius - centerDent - stoneDepth / 2 - erosion;
        const centerY = y + height / 2;

        // Leave a small stepped scar around the original north entrance's chevrons.
        // The solid backing remains behind it; this does not expose the pyramid interior.
        const entranceScar = face === 0 && centerY > 1.57 && centerY < 2.31 &&
          Math.abs(alongFace - 0.729) < (centerY > 2.15 ? 0.26 : 0.49);
        if (!entranceScar) {
          position.set(alongFace, centerY, outward).applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
          scale.set(width, height, stoneDepth);
          matrix.compose(position, quaternion, scale);
          const band = Math.sin(course * 0.35) * 0.028;
          const shade = 0.83 + random() * 0.30 + band;
          color.setRGB(shade, shade * (0.986 + random() * 0.025), shade * (0.97 + random() * 0.033));
          const variant = Math.floor(random() * PATCH_VARIANTS);
          matrices[variant].push({ matrix: matrix.clone(), color: color.clone() });
        }
        cursor += width;
        patch++;
      }
    }
    y += height;
  }
  for (let variant = 0; variant < PATCH_VARIANTS; variant++) {
    const patches = matrices[variant];
    const mesh = new THREE.InstancedMesh(weatheredStonePatch(variant), stoneMaterial, patches.length);
    mesh.name = `风化石块 ${variant + 1}`;
    mesh.castShadow = mesh.receiveShadow = true;
    patches.forEach((patch, index) => {
      mesh.setMatrixAt(index, patch.matrix);
      mesh.setColorAt(index, patch.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    blocks.add(mesh);
  }
  backing.instanceMatrix.needsUpdate = true;
  backing.computeBoundingSphere();
  group.add(backing);

  const entrance = new THREE.Group();
  entrance.name = '北面原入口与双层人字形减压石';
  entrance.position.set(0.729, 1.7, radiusAt(1.7) - 0.078);
  entrance.rotation.x = -Math.atan(HALF_BASE / ORIGINAL_HEIGHT);
  group.add(entrance);
  const scarMaterial = new THREE.MeshStandardMaterial({ color: 0x79694f, roughness: 1, metalness: 0 });
  const entranceMaterial = new THREE.MeshStandardMaterial({ color: 0x221c14, roughness: 1, metalness: 0 });
  const chevronMaterial = new THREE.MeshStandardMaterial({ color: 0xc4b292, roughness: 1, metalness: 0, bumpMap: grain, bumpScale: 0.009 });
  const scarShape = new THREE.Shape();
  scarShape.moveTo(-0.40, -0.18);
  scarShape.lineTo(0.39, -0.18);
  scarShape.lineTo(0.46, 0.13);
  scarShape.lineTo(0.35, 0.42);
  scarShape.lineTo(0.08, 0.64);
  scarShape.lineTo(-0.18, 0.59);
  scarShape.lineTo(-0.45, 0.25);
  scarShape.closePath();
  const scar = new THREE.Mesh(new THREE.ShapeGeometry(scarShape), scarMaterial);
  entrance.add(scar);
  const opening = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.145, 0.025), entranceMaterial);
  opening.position.set(0, 0, 0.008);
  entrance.add(opening);
  const chevronGeometry = new THREE.BoxGeometry(0.43, 0.105, 0.115);
  for (let tier = 0; tier < 2; tier++) {
    for (const side of [-1, 1]) {
      const stone = new THREE.Mesh(chevronGeometry, chevronMaterial);
      stone.position.set(side * 0.169, 0.19 + tier * 0.15, 0.035);
      stone.rotation.z = -side * 0.64;
      stone.castShadow = stone.receiveShadow = true;
      entrance.add(stone);
    }
  }

  // A few surviving Tura stones occur at the foot, not as Khafre's familiar white cap.
  const remnantMaterial = new THREE.MeshStandardMaterial({ color: 0xd3c5a6, roughness: 0.91, metalness: 0, bumpMap: grain, bumpScale: 0.005 });
  const remnants = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), remnantMaterial, 14);
  remnants.name = '塔基零星残存的图拉石灰岩';
  remnants.userData.casingRemnant = true;
  remnants.castShadow = remnants.receiveShadow = true;
  for (let i = 0; i < remnants.count; i++) {
    const north = i < 10;
    const width = 0.17 + random() * 0.045;
    const height = 0.087 + random() * 0.05;
    quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, north ? 0 : Math.PI / 2);
    position.set(north ? (i - 4.5) * 0.225 : HALF_BASE - 0.075, height / 2, north ? HALF_BASE - 0.075 : 3.1 + (i - 10) * 0.225);
    matrix.compose(position, quaternion, scale.set(width, height, 0.15));
    remnants.setMatrixAt(i, matrix);
  }
  remnants.instanceMatrix.needsUpdate = true;
  remnants.computeBoundingSphere();
  group.add(remnants);

  return {
    group,
    blocks,
    backing,
    courseHeights,
    height: PRESENT_HEIGHT,
    halfBase: HALF_BASE,
    materials: [stoneMaterial, backingMaterial, scarMaterial, entranceMaterial, chevronMaterial, remnantMaterial],
  };
}
