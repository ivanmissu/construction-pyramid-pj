import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import * as THREE from 'three';

register('./typescript-loader.mjs', import.meta.url);
const { buildModel } = await import('../src/scene/khufu.ts');
const { buildConstructionWorkers } = await import('../src/scene/workers.ts');

function instanceBounds(mesh) {
  mesh.geometry.computeBoundingBox();
  const matrix = new THREE.Matrix4();
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, matrix);
    matrix.premultiply(mesh.matrixWorld);
    return mesh.geometry.boundingBox.clone().applyMatrix4(matrix);
  });
}

test('quarry stones rest on sand outside the excavation', () => {
  const model = buildModel();
  const stones = model.extra.children.find((mesh) => mesh.isInstancedMesh && mesh.count === 160);
  model.root.updateMatrixWorld(true);
  stones.geometry.computeBoundingBox();
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < stones.count; i++) {
    stones.getMatrixAt(i, matrix);
    matrix.premultiply(stones.matrixWorld);
    const bounds = stones.geometry.boundingBox.clone().applyMatrix4(matrix);
    assert.ok(Math.abs(bounds.min.y + 0.32) < 1e-6, 'stone base must touch the sand');
    const center = bounds.getCenter(new THREE.Vector3());
    assert.ok(Math.max(Math.abs(center.x), Math.abs(center.z)) >= 13.5, 'stone cannot float above the excavation');
  }
});

test('quarry supply yards leave the moving crews and sled lanes clear', () => {
  const model = buildModel();
  model.root.updateMatrixWorld(true);
  const stones = instanceBounds(model.extra.getObjectByName('施工场待用石料'));
  const workers = buildConstructionWorkers();
  try {
    for (const progress of [0.05, 0.15, 0.3, 0.45, 0.6, 0.75, 0.84]) {
      workers.update(progress, true, 'solid');
      workers.group.updateMatrixWorld(true);
      for (const name of ['工人躯干', '工人四肢', '雪橇木架与工具柄']) {
        const crewBounds = instanceBounds(workers.group.getObjectByName(name));
        for (const [workerIndex, worker] of crewBounds.entries()) {
          for (const [stoneIndex, stone] of stones.entries()) {
            assert.equal(worker.intersectsBox(stone), false,
              `${name} ${workerIndex} intersects quarry stone ${stoneIndex} at ${progress}`);
          }
        }
      }
    }
  } finally {
    workers.dispose();
  }
});

test('stored quarry stones have room between individual blocks', () => {
  const model = buildModel();
  model.root.updateMatrixWorld(true);
  const bounds = instanceBounds(model.extra.getObjectByName('施工场待用石料'));
  for (let i = 0; i < bounds.length; i++) {
    for (let j = i + 1; j < bounds.length; j++) {
      assert.equal(bounds[i].intersectsBox(bounds[j]), false, `quarry stones ${i} and ${j} overlap`);
    }
  }
});
