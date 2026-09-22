import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import * as THREE from 'three';

register('./typescript-loader.mjs', import.meta.url);
const { buildModel, HALF, HEIGHT, S } = await import('../src/scene/khufu.ts');
const { createAlignedBox, buildPassageSteps } = await import('../src/scene/interiorDetail.ts');
const model = buildModel();
model.root.updateMatrixWorld(true);

test('built tunnel sections stay inside the pyramid footprint instead of floating at meter coordinates', () => {
  for (const id of ['entrance', 'ascending', 'subterranean', 'queens', 'kings', 'north-corridor']) {
    const feature = model.features.find((item) => item.id === id);
    assert.ok(feature, `${id} must exist in the actual model`);
    const bounds = new THREE.Box3().setFromObject(feature.group);
    assert.ok(bounds.min.x >= -HALF && bounds.max.x <= HALF, `${id}: x bounds ${bounds.min.x}, ${bounds.max.x}`);
    assert.ok(bounds.min.z >= -HALF && bounds.max.z <= HALF, `${id}: z bounds ${bounds.min.z}, ${bounds.max.z}`);
    assert.ok(bounds.min.y >= -4.0 && bounds.max.y <= HEIGHT, `${id}: y bounds ${bounds.min.y}, ${bounds.max.y}`);
  }
});

test('descending tunnel stone segments form one contiguous passage beside its floor', () => {
  const entrance = model.features.find((item) => item.id === 'entrance');
  const floor = entrance.meshes.find((mesh) => mesh.userData.growAxis === 'z');
  assert.ok(floor);
  const start = new THREE.Vector3(0, 17, 101.8).multiplyScalar(S);
  const end = new THREE.Vector3(0, -29.9, 8).multiplyScalar(S);
  const direction = end.clone().sub(start).normalize();
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(floor.quaternion);
  const rings = entrance.meshes.slice(0, 36);
  const passageLength = start.distanceTo(end);
  for (let i = 0; i < rings.length; i++) {
    const center = rings[i].getWorldPosition(new THREE.Vector3());
    const stoneDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(rings[i].quaternion);
    assert.ok(stoneDirection.distanceTo(direction) < 1e-6, 'stone length must follow the downward passage axis');
    const floorCenter = center.clone().addScaledVector(normal, -(1.17 * S) / 2);
    const expected = start.clone().lerp(end, (i + 0.5) / rings.length);
    assert.ok(floorCenter.distanceTo(expected) < 1e-6, `segment ${i} must sit on the same scaled path as the floor`);
    if (i > 0) {
      const previous = rings[i - 1].getWorldPosition(new THREE.Vector3());
      const spacing = center.clone().sub(previous).dot(direction);
      assert.ok(Math.abs(spacing - passageLength / rings.length) < 1e-6, 'adjacent segments must meet without a tenfold gap');
    }
  }
});

test('aligned floor and wall geometry reaches its two real passage endpoints', () => {
  const from = [0, 21.3, 41.4];
  const to = [0, 42.35, -1.6];
  const start = new THREE.Vector3(...from).multiplyScalar(S);
  const end = new THREE.Vector3(...to).multiplyScalar(S);
  const box = createAlignedBox(new THREE.Group(), new THREE.MeshStandardMaterial(), from, to, 1, 1);
  box.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromBufferAttribute(box.geometry.getAttribute('position'));
  const geometryStart = new THREE.Vector3(0, 0, bounds.min.z).applyMatrix4(box.matrixWorld);
  const geometryEnd = new THREE.Vector3(0, 0, bounds.max.z).applyMatrix4(box.matrixWorld);
  assert.ok(Math.abs(box.quaternion.length() - 1) < 1e-6, 'passage axes must form a proper rotation, not a reflection');
  assert.ok(geometryStart.distanceTo(start) < 1e-6);
  assert.ok(geometryEnd.distanceTo(end) < 1e-6, 'floor must reach the upper gallery endpoint');
});

test('gallery stone segments meet instead of leaving gaps nine times their depth', () => {
  const gallery = model.features.find((item) => item.id === 'gallery');
  const rings = gallery.meshes.slice(0, 18);
  for (let i = 1; i < rings.length; i++) {
    const spacing = rings[i].position.distanceTo(rings[i - 1].position);
    assert.ok(Math.abs(spacing - rings[i].geometry.parameters.depth) < 1e-6, `gallery segment ${i} must cover its full interval`);
  }
});

for (const [id, ringCount] of [['entrance', 36], ['ascending', 18], ['gallery', 18]]) {
  test(`${id} stone rings leave the full passage axis open in both directions`, () => {
    const feature = model.features.find((item) => item.id === id);
    const rings = feature.meshes.slice(0, ringCount);
    const first = rings[0];
    const last = rings.at(-1);
    const start = first.localToWorld(new THREE.Vector3(0, 0, -first.geometry.parameters.depth / 2 + 1e-5));
    const end = last.localToWorld(new THREE.Vector3(0, 0, last.geometry.parameters.depth / 2 - 1e-5));
    for (const [from, to] of [[start, end], [end, start]]) {
      const ray = new THREE.Raycaster(from, to.clone().sub(from).normalize(), 0, from.distanceTo(to));
      const hits = ray.intersectObjects(rings, false);
      assert.equal(hits.length, 0, `${id}: ${hits.length} stone faces block the passage axis`);
    }

    const middle = rings[Math.floor(rings.length / 2)];
    const center = middle.getWorldPosition(new THREE.Vector3());
    for (const normal of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]) {
      const direction = new THREE.Vector3(...normal).applyQuaternion(middle.quaternion);
      const ray = new THREE.Raycaster(center, direction);
      assert.ok(ray.intersectObject(middle, false).length > 0, `${id}: passage walls, floor and ceiling must remain`);
    }
  });
}

test('instanced wooden steps use supported positive-determinant transforms', () => {
  const steps = buildPassageSteps(new THREE.Group(), new THREE.MeshStandardMaterial(), [0, 17, 101.8], [0, -29.9, 8], 8);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < steps.count; i++) {
    steps.getMatrixAt(i, matrix);
    assert.ok(Math.abs(matrix.determinant() - 1) < 1e-6, 'mirrored instance matrices can invert visible faces');
  }
});
