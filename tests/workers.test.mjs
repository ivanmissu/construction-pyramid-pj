import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import * as THREE from 'three';

register('./typescript-loader.mjs', import.meta.url);
const { buildConstructionWorkers } = await import('../src/scene/workers.ts');

const instances = (group) => group.children.filter((child) => child.isInstancedMesh);
const snapshot = (group) => instances(group).map((mesh) => Array.from(mesh.instanceMatrix.array));

test('construction crews use a small number of instanced batches at human scale', () => {
  const workers = buildConstructionWorkers();
  workers.update(0.4, true, 'solid');
  const meshes = instances(workers.group);
  assert.ok(meshes.length >= 6 && meshes.length <= 20);
  const torsos = workers.group.getObjectByName('工人躯干');
  assert.ok(torsos.count >= 180 && torsos.count <= 300, 'the worksite should read as a large workforce');
  assert.ok(meshes.filter((mesh) => mesh.castShadow).length <= 3);
  workers.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(workers.group.getObjectByName('工人头部'));
  assert.ok(bounds.max.y - workers.group.position.y < 0.27);
  workers.dispose();
});

test('the workforce occupies every side of the pyramid with visible front work yards', () => {
  const workers = buildConstructionWorkers();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  for (const progress of [0.1, 0.4, 0.8]) {
    workers.update(progress, true, 'solid');
    const torso = workers.group.getObjectByName('工人躯干');
    const sides = { north: 0, south: 0, east: 0, west: 0 };
    let closeWorkers = 0;
    for (let index = 0; index < torso.count; index++) {
      torso.getMatrixAt(index, matrix);
      position.setFromMatrixPosition(matrix);
      if (position.z >= 14.5) sides.south++;
      else if (position.z <= -14.5) sides.north++;
      else if (position.x >= 14.5) sides.east++;
      else if (position.x <= -14.5) sides.west++;
      if (position.x > 1 && position.x < 7 && position.z > 16.5 && position.z < 19.5) closeWorkers++;
    }
    for (const [side, count] of Object.entries(sides)) assert.ok(count >= 20, `${side} has only ${count} workers`);
    assert.ok(closeWorkers >= 8, 'the construction close-up must keep the masons in view');
  }
  workers.dispose();
});

test('worksite shelters, stored stones, and water supplies stay fixed as crews move', () => {
  const workers = buildConstructionWorkers();
  workers.update(0.25, true, 'solid');
  const names = ['工地遮阳棚', '石料堆场', '补给水罐'];
  const scenery = names.map((name) => workers.group.getObjectByName(name));
  for (const [index, mesh] of scenery.entries()) {
    assert.ok(mesh?.isInstancedMesh && mesh.count >= 4, `${names[index]} is missing`);
  }
  const poses = scenery.map((mesh) => Array.from(mesh.instanceMatrix.array));
  const versions = scenery.map((mesh) => mesh.instanceMatrix.version);
  workers.update(0.65, true, 'solid');
  assert.deepEqual(scenery.map((mesh) => Array.from(mesh.instanceMatrix.array)), poses);
  assert.deepEqual(scenery.map((mesh) => mesh.instanceMatrix.version), versions);
  workers.dispose();
});

test('paused repeated updates leave both poses and GPU versions unchanged', () => {
  const workers = buildConstructionWorkers();
  workers.update(0.4, true, 'solid');
  const poses = snapshot(workers.group);
  const versions = instances(workers.group).map((mesh) => mesh.instanceMatrix.version);
  for (let i = 0; i < 10; i++) workers.update(0.4, false, 'solid');
  assert.deepEqual(snapshot(workers.group), poses);
  assert.deepEqual(instances(workers.group).map((mesh) => mesh.instanceMatrix.version), versions);
  workers.dispose();
});

test('seeking backwards exactly restores workers, ropes, tools, and stones', () => {
  const workers = buildConstructionWorkers();
  workers.update(0.25, false, 'solid');
  const poses = snapshot(workers.group);
  workers.update(0.7, true, 'solid');
  assert.notDeepEqual(snapshot(workers.group), poses);
  workers.update(0.25, false, 'solid');
  assert.deepEqual(snapshot(workers.group), poses);
  workers.dispose();
});

test('all working parts stay outside the pyramid and on the construction ground', () => {
  const workers = buildConstructionWorkers();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  for (let frame = 1; frame < 88; frame++) {
    workers.update(frame / 100, true, 'solid');
    for (const mesh of instances(workers.group)) {
      for (let index = 0; index < mesh.count; index++) {
        mesh.getMatrixAt(index, matrix);
        position.setFromMatrixPosition(matrix);
        assert.ok(Math.abs(position.x) >= 14.5 || Math.abs(position.z) >= 14.5, `${mesh.name} entered tower at ${position.toArray()}`);
        assert.ok(position.y + workers.group.position.y >= -0.32, `${mesh.name} is below the sand`);
      }
    }
  }
  workers.dispose();
});

test('crews appear only during construction and hide in archaeological and interior modes', () => {
  const workers = buildConstructionWorkers();
  for (const mode of ['today', 'inside', 'interior']) {
    workers.update(0.4, true, mode);
    assert.equal(workers.group.visible, false);
  }
  for (const p of [0, 0.89, 1]) {
    workers.update(p, true, 'solid');
    assert.equal(workers.group.visible, false);
  }
  workers.update(0.4, false, 'solid');
  assert.equal(workers.group.visible, true);
  const material = workers.group.getObjectByName('工人躯干').material;
  assert.equal(material.opacity, 1);
  workers.update(0.86, true, 'solid');
  assert.ok(material.opacity > 0 && material.opacity < 1);
  workers.dispose();
});
