import * as THREE from 'three';

/** A passage segment keeps its walls, floor and ceiling open along local Z. */
export function createOpenPassageGeometry(width: number, height: number, depth: number) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const indices = geometry.getIndex()!;
  // BoxGeometry groups are +X, -X, +Y, -Y, +Z, -Z; only the last two seal the path.
  const sides = geometry.groups.filter((group) => group.materialIndex! < 4);
  geometry.setIndex(sides.flatMap((group) => Array.from(indices.array.slice(group.start, group.start + group.count))));
  geometry.clearGroups();
  return geometry;
}
