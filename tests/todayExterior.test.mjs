import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import * as THREE from 'three';

register('./typescript-loader.mjs', import.meta.url);
const { buildTodayExterior } = await import('../src/scene/todayExterior.ts');

test('the present-day pyramid has a broad missing summit and no restored upper casing', () => {
  const exterior = buildTodayExterior();
  exterior.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(exterior.group);
  assert.ok(Math.abs(bounds.max.y - 13.75) < 0.02);
  assert.ok(Math.abs(bounds.min.y) < 0.02);
  assert.ok(bounds.max.x - bounds.min.x > 22.8 && bounds.max.x - bounds.min.x < 23.2);
  const summit = new THREE.Raycaster(new THREE.Vector3(0.3, 20, 0.3), new THREE.Vector3(0, -1, 0));
  assert.ok(Math.abs(summit.intersectObject(exterior.group, true)[0].point.y - 13.75) < 0.02);
  exterior.group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    assert.equal(mesh.material.transparent, false);
    assert.equal(mesh.material.metalness, 0);
    if (mesh.userData.casingRemnant) {
      assert.ok(new THREE.Box3().setFromObject(mesh).max.y < 0.2, 'remaining casing belongs at the foot');
    }
  });
});

test('stone joints cannot expose the sky or interior through the present-day faces', () => {
  const { group } = buildTodayExterior();
  group.updateMatrixWorld(true);
  for (const y of [0.3, 1.1, 3.35, 5.8, 8.2, 11.3, 13.65]) {
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const normal = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      const origin = normal.clone().multiplyScalar(20).setY(y);
      const hits = new THREE.Raycaster(origin, normal.negate()).intersectObject(group, true);
      assert.ok(hits.length > 0, `solid face at y=${y}, angle=${angle}`);
      assert.ok(hits[0].distance < 20, 'the near face must stop the ray before the opposite wall');
    }
  }
});

test('weathered stone layout is deterministic, varies course heights, and keeps draw batches bounded', () => {
  const a = buildTodayExterior();
  const b = buildTodayExterior();
  assert.equal(a.courseHeights.length, 203);
  assert.ok(new Set(a.courseHeights.map((height) => height.toFixed(3))).size > 15);
  const meshesA = a.blocks.children;
  const meshesB = b.blocks.children;
  assert.ok(meshesA.length <= 8);
  assert.ok(meshesA.reduce((count, mesh) => count + mesh.count, 0) < 22000);
  const shades = new Set();
  meshesA.forEach((mesh, i) => {
    assert.deepEqual(mesh.instanceMatrix.array, meshesB[i].instanceMatrix.array);
    assert.deepEqual(mesh.instanceColor.array, meshesB[i].instanceColor.array);
    for (let j = 0; j < mesh.count * 3; j += 3) shades.add(mesh.instanceColor.array[j].toFixed(2));
  });
  assert.ok(shades.size > 20, 'weathered stone has meaningful color variation');
});
