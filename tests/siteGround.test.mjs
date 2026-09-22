import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import * as THREE from 'three';

register('./typescript-loader.mjs', import.meta.url);
const { buildModel } = await import('../src/scene/khufu.ts');

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
