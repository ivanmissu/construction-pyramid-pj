"""Run with Blender --background --factory-startup --python-exit-code 1 --python ... -- OUTPUT_DIR."""
import json
from pathlib import Path
import runpy
import struct
import sys
import unittest

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
output = Path(args[0])
existing = '--existing' in args
if existing:
    bpy.ops.wm.open_mainfile(filepath=str(output / 'khufu_great_pyramid.blend'))
else:
    sentinel = bpy.data.objects.new('User object to preserve', None)
    bpy.context.scene.collection.objects.link(sentinel)
    source = Path(__file__).resolve().parents[1] / 'public' / 'khufu_great_pyramid.py'
    sys.argv = ['blender', '--', '--output-dir', str(output)]
    runpy.run_path(str(source), run_name='__main__')

scene = bpy.context.scene
saved_frame = scene.frame_current
glb = (output / 'khufu_great_pyramid.glb').read_bytes()
gltf = json.loads(glb[20:20 + struct.unpack_from('<I', glb, 12)[0]])


class BlenderExportTests(unittest.TestCase):
    def test_saved_project_opens_at_completed_frame(self):
        self.assertEqual(saved_frame, 480)
        self.assertGreater((output / 'khufu_great_pyramid.blend').stat().st_size, 10000)

    def test_camera_keeps_the_pyramid_in_view_throughout_animation(self):
        for frame in range(1, 481, 12):
            scene.frame_set(frame)
            target = scene.camera.constraints[0].target
            self.assertLessEqual(target.location.z, 146.6, f'camera target above pyramid at {frame}')
            point = world_to_camera_view(scene, scene.camera, Vector((0, 0, 65)))
            self.assertTrue(0 < point.x < 1 and 0 < point.y < 1 and point.z > 0,
                            f'pyramid outside camera at frame {frame}: {point}')

    def test_cutting_helper_is_not_rendered_or_exported(self):
        helper = next(ob for ob in scene.objects if ob.name.startswith('剖切方块'))
        self.assertTrue(helper.hide_render)
        self.assertFalse(any(node.get('name', '').startswith('剖切方块') for node in gltf['nodes']))

    def test_glb_has_one_complete_construction_animation(self):
        self.assertEqual(len(gltf.get('animations', [])), 1)
        channels = gltf['animations'][0]['channels']
        self.assertGreater(len({channel['target']['node'] for channel in channels}), 100)
        node = next(node for node in gltf['nodes'] if node['name'] == '石核_层01')
        self.assertEqual(node.get('scale', [1, 1, 1]), [1, 1, 1])

    def test_glb_compatible_birth_scale_hides_unbuilt_objects(self):
        scene.frame_set(1)
        for name in ('石核_层40', '外壳_层01', '顶石_Pyramidion'):
            self.assertLess(max(scene.objects[name].scale), 0.0001, name)
        scene.frame_set(480)
        for name in ('石核_层40', '外壳_层01', '顶石_Pyramidion'):
            self.assertTrue(all(abs(v - 1) < 0.0001 for v in scene.objects[name].scale), name)

    def test_existing_user_scene_survives_generation(self):
        if existing:
            self.skipTest('old artifact has no sentinel')
        self.assertIn('User object to preserve', bpy.data.objects)
        self.assertNotIn('User object to preserve', scene.objects)
        self.assertFalse(any(node.get('name') == 'User object to preserve' for node in gltf['nodes']))


result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(BlenderExportTests))
if not result.wasSuccessful():
    raise RuntimeError('Blender export regression checks failed')

# Verify saved files can actually be reopened/imported in Blender.
bpy.ops.wm.open_mainfile(filepath=str(output / 'khufu_great_pyramid.blend'))
assert bpy.context.scene.frame_current == 480
bpy.context.window.scene = bpy.data.scenes.new('GLB reimport check')
bpy.ops.import_scene.gltf(filepath=str(output / 'khufu_great_pyramid.glb'))
assert len(bpy.context.scene.objects) > 130
print('KHUFU_BLENDER_CHECKS_PASSED')
