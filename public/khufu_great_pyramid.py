# -*- coding: utf-8 -*-
"""
================================================================================
  胡夫金字塔 Great Pyramid of Khufu  ·  Blender 工程生成脚本
  简化外立面 + 内部结构示意 + 建造过程动画  ->  .blend  /  .glb
--------------------------------------------------------------------------------
  使用方法（二选一）

  A) 图形界面（推荐）
     1. 打开 Blender（已在 5.2.1 验证）
     2. 顶部工作区标签切到 "Scripting"
     3. 在文本编辑器中点 "Open" 选择本文件 -> ▶ Run Script（或 Alt+P）
        不要用 File > Open 打开 .py，也不要用系统 Python 运行
     4. 默认输出至 ~/Downloads/KhufuPyramid/，完成时显示实际路径
        .blend 打开即显示完成态；跳到第 1 帧再播放 480 帧建造动画

  B) 命令行 / 无界面（macOS 终端，一次跑完）
     /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
        --python ~/Downloads/khufu_great_pyramid.py -- --output-dir ~/Downloads/KhufuPyramid

  查看内部结构：
     - 同时隐藏 "02_石核砌体" 和 "04_石灰岩外壳" 查看内部实体示意；或
     - 场景中已放置 "剖切方块_东北象限" 并挂好 Boolean 修改器（默认关闭）
       在修改器面板点开 Boolean 的显示眼睛即可得到四分之一剖切视图
  渲染动画：
     scene 已设置 480 帧 @24fps（20 秒）。渲染 -> 渲染动画（或 --render-anim）
================================================================================
"""

import argparse
import math
import os
import sys
import tempfile

try:
    import bpy
    import bmesh
except ModuleNotFoundError as error:
    raise SystemExit('请在 Blender 的 Scripting 文本编辑器中运行，或用 Blender --background --python 本文件；不能使用系统 Python。') from error
from mathutils import Vector, Matrix

# ------------------------------------------------------------------ 可调参数
BASE_SIDE = 230.33     # 底边边长 (m)
HEIGHT    = 146.60     # 原高      (m)
N_CORE    = 40         # 石核层数（粗石砌体）
N_CASING  = 40         # 白色外壳层数
TREAD     = 0.65       # 石核每层内缩 (m)
FPS       = 24
FRAME_END = 480        # 建造动画总帧数
OUT_DIR   = os.path.expanduser("~/Downloads/KhufuPyramid")  # 可改为自己的输出目录

parser = argparse.ArgumentParser(description='生成胡夫金字塔 Blender 工程')
parser.add_argument('--output-dir', default=OUT_DIR, help='输出 .blend 和 .glb 的文件夹')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
OUT_DIR = os.path.abspath(os.path.expanduser(args.output_dir))
try:
    os.makedirs(OUT_DIR, exist_ok=True)
    # 提前验证写权限，避免建模完成后才发现目录不可写。
    with tempfile.TemporaryFile(dir=OUT_DIR) as probe:
        probe.write(b'khufu')
except OSError as error:
    raise RuntimeError('无法写入输出目录 %s；请修改 OUT_DIR 或传入 --output-dir。' % OUT_DIR) from error

HALF  = BASE_SIDE / 2.0
SLOPE = HEIGHT / HALF

BLEND_PATH = os.path.join(OUT_DIR, "khufu_great_pyramid.blend")
GLB_PATH   = os.path.join(OUT_DIR, "khufu_great_pyramid.glb")

C_SAND   = (0.78, 0.66, 0.45, 1.0)
C_CORE   = (0.72, 0.62, 0.45, 1.0)
C_CASING = (0.93, 0.90, 0.82, 1.0)
C_GOLD   = (0.83, 0.63, 0.22, 1.0)
C_GRANITE= (0.58, 0.28, 0.24, 1.0)
C_WOOD   = (0.42, 0.26, 0.14, 1.0)

# ============================================================ 基础工具函数
def new_collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col

def set_input(bsdf, names, value):
    for n in names:
        if n in bsdf.inputs:
            bsdf.inputs[n].default_value = value
            return True
    return False

def mat(name, color, rough=0.85, metal=0.0, alpha=1.0, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    if bsdf is None:
        for n in nt.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                bsdf = n
                break
    if bsdf is None:
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        nt.links.new(bsdf.outputs[0], nt.nodes['Material Output'].inputs[0])
    set_input(bsdf, ['Base Color'], color)
    set_input(bsdf, ['Roughness'], rough)
    set_input(bsdf, ['Metallic'], metal)
    set_input(bsdf, ['Alpha'], alpha)
    if emit > 0.0:
        set_input(bsdf, ['Emission Color', 'Emission'], color)
        set_input(bsdf, ['Emission Strength'], emit)
    if alpha < 1.0:
        try:
            m.surface_render_method = 'DITHERED'
        except Exception:
            try:
                m.blend_method = 'BLEND'
            except Exception:
                pass
    m.diffuse_color = (*color[:3], alpha)
    return m

def _cone(bm, r1, r2, depth, matrix):
    try:
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=4,
                              radius1=r1, radius2=r2, depth=depth, matrix=matrix)
    except TypeError:
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=4,
                              diameter1=r1 * 2.0, diameter2=r2 * 2.0, depth=depth, matrix=matrix)

def slab(name, coll, bottom_half, top_half, hgt, material, z0):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    mtx = Matrix.Translation((0.0, 0.0, hgt * 0.5)) @ Matrix.Rotation(math.radians(45.0), 4, 'Z')
    _cone(bm, bottom_half * math.sqrt(2.0), top_half * math.sqrt(2.0), hgt, mtx)
    bm.normal_update()
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = (0.0, 0.0, z0)
    coll.objects.link(ob)
    me.materials.append(material)
    return ob

def B(p):
    """(东 x, 高 y, 北 z) -> Blender (x, y, z) = (东, 北, 高)"""
    return Vector((p[0], p[2], p[1]))

def box(name, coll, size, material, loc=(0.0, 0.0, 0.0), rot=None, swap=True):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    s = (size[0], size[2], size[1]) if swap else (size[0], size[1], size[2])
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal(Vector((s[0], s[1], s[2], 1.0))))
    bm.normal_update()
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = B(loc) if swap else Vector(loc)
    if rot is not None:
        ob.rotation_euler = rot
    coll.objects.link(ob)
    me.materials.append(material)
    return ob

def tube(name, coll, a, b, width, height, material):
    va, vb = B(a), B(b)
    d = vb - va
    ob = box(name, coll, (width, height, d.length), material, loc=(va + vb) * 0.5, swap=False)
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = d.to_track_quat('Z', 'Y')
    return ob

def action_fcurves(action):
    """
    兼容 Blender 3.x / 4.x / 5.x 的 Action，返回其全部 FCurve：
      · 3.x~4.3：旧式 Action，FCurve 在 action.fcurves
      · 4.4+/5.x：分层 Action（slotted），FCurve 在
        action.layers[].strips[].channelbags[].fcurves
    """
    if action is None:
        return []
    curves = []
    try:
        curves.extend(list(action.fcurves))
    except Exception:
        pass
    try:
        layers = getattr(action, "layers", None)
        if layers:
            for layer in layers:
                for strip in getattr(layer, "strips", ()):
                    channelbags = getattr(strip, "channelbags", None)
                    if channelbags:
                        for bag in channelbags:
                            try:
                                curves.extend(list(bag.fcurves))
                            except Exception:
                                pass
    except Exception:
        pass
    return curves

def set_ease(ob):
    """对对象当前 Action 的所有关键帧设置 BEZIER / EASE_OUT（跨版本安全）。"""
    try:
        if not (ob.animation_data and ob.animation_data.action):
            return
        for fc in action_fcurves(ob.animation_data.action):
            for kp in fc.keyframe_points:
                try:
                    kp.interpolation = 'BEZIER'
                    kp.handle_left_type = 'AUTO_CLAMPED'
                    kp.handle_right_type = 'AUTO_CLAMPED'
                except Exception:
                    pass
                try:
                    kp.easing = 'EASE_OUT'
                except Exception:
                    pass
            try:
                fc.update()
            except Exception:
                pass
    except Exception as e:
        print("  (set_ease skipped:", e, ")")

def grow(ob, f_start, f_end, axis='Z', f_ins=0.02, ease=True):
    ob.scale = (1.0, 1.0, 1.0)
    if axis == 'Z':
        a, b2 = (1.0, 1.0, f_ins), (1.0, 1.0, 1.0)
    elif axis == 'Y':
        a, b2 = (1.0, f_ins, 1.0), (1.0, 1.0, 1.0)
    else:
        a, b2 = (f_ins, 1.0, 1.0), (1.0, 1.0, 1.0)
    ob.scale = a
    ob.keyframe_insert(data_path='scale', frame=f_start)
    ob.scale = b2
    ob.keyframe_insert(data_path='scale', frame=f_end)
    if ease:
        set_ease(ob)

def hide_anim(ob, f_in, f_out=None):
    # glTF 不支持 hide_render/hide_viewport 动画，额外用三轴缩放隐藏待建构件。
    start_scale = list(ob.scale)
    action = ob.animation_data.action if ob.animation_data else None
    for curve in action_fcurves(action):
        if curve.data_path == 'scale':
            start_scale[curve.array_index] = curve.evaluate(f_in)
    ob.scale = (0.000001,) * 3
    ob.keyframe_insert(data_path='scale', frame=1)
    ob.keyframe_insert(data_path='scale', frame=f_in - 1)
    ob.scale = start_scale
    ob.keyframe_insert(data_path='scale', frame=f_in)
    set_ease(ob)
    for curve in action_fcurves(ob.animation_data.action):
        if curve.data_path == 'scale':
            for key in curve.keyframe_points:
                if key.co.x < f_in:
                    key.interpolation = 'CONSTANT'
    try:
        ob.hide_render = True
        ob.keyframe_insert(data_path='hide_render', frame=f_in - 1)
        ob.hide_render = False
        ob.keyframe_insert(data_path='hide_render', frame=f_in)
    except Exception:
        pass
    try:
        ob.hide_viewport = True
        ob.keyframe_insert(data_path='hide_viewport', frame=f_in - 1)
        ob.hide_viewport = False
        ob.keyframe_insert(data_path='hide_viewport', frame=f_in)
    except Exception:
        pass

def fade_out(ob, f_start, f_end):
    ob.scale = (1.0, 1.0, 1.0)
    ob.keyframe_insert(data_path='scale', frame=f_start)
    ob.scale = (1.0, 0.01, 1.0)
    ob.keyframe_insert(data_path='scale', frame=f_end)
    set_ease(ob)

# ============================================================ 建造流程帧位
F = FRAME_END
def f_at(t):
    return int(round(t * F))

T_SURVEY, T_COURSE1, T_CORE_END = f_at(0.03), f_at(0.07), f_at(0.55)
T_CASING, T_CASING_E  = f_at(0.70), f_at(0.92)
T_TOP, T_FIN          = f_at(0.93), f_at(0.97)

# ============================================================ 开始构建
print("\n=== 胡夫金字塔生成器 · Blender", bpy.app.version_string, "===")
sc = bpy.data.scenes.new('Khufu_Generated')
bpy.context.window.scene = sc
sc.render.fps = FPS
sc.frame_start, sc.frame_end = 1, FRAME_END
sc.unit_settings.system = 'METRIC'
sc.unit_settings.scale_length = 1.0
sc.render.resolution_x = 1600
sc.render.resolution_y = 1000
sc.render.resolution_percentage = 100
sc.render.filepath = os.path.join(OUT_DIR, 'frames', 'khufu_')

try:
    items = [i.identifier for i in sc.render.bl_rna.properties['engine'].enum_items]
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
        if eng in items:
            sc.render.engine = eng
            break
except Exception:
    pass

world = bpy.data.worlds.new("沙漠天空")
sc.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get('Background')
if bg:
    bg.inputs[0].default_value = (0.62, 0.72, 0.86, 1.0)
    bg.inputs[1].default_value = 1.1

sun_data = bpy.data.lights.new("太阳", type='SUN')
sun_data.energy = 4.2
sun = bpy.data.objects.new("太阳", sun_data)
sun.rotation_euler = (math.radians(58), 0.0, math.radians(-40))
sc.collection.objects.link(sun)
sun.keyframe_insert(data_path='rotation_euler', frame=1)
sun.rotation_euler = (math.radians(62), 0.0, math.radians(20))
sun.keyframe_insert(data_path='rotation_euler', frame=f_at(0.55))
sun.rotation_euler = (math.radians(66), 0.0, math.radians(95))
sun.keyframe_insert(data_path='rotation_euler', frame=F)

# 材质
M_SAND   = mat("砂土/沙漠", C_SAND, rough=1.0)
M_ROCK   = mat("基岩", (0.52, 0.46, 0.36, 1.0), rough=1.0)
M_CORE   = mat("石核/石灰岩粗石", C_CORE, rough=0.95)
M_CASING = mat("图拉石灰岩外壳", C_CASING, rough=0.35, alpha=1.0)
M_CAS_T  = mat("图拉石灰岩外壳_半透明", C_CASING, rough=0.35, alpha=0.30)
M_GOLD   = mat("顶石/镀金", C_GOLD, rough=0.28, metal=0.85, emit=0.35)
M_GRANITE= mat("阿斯旺花岗岩", C_GRANITE, rough=0.45)
M_LIMEST = mat("内部石灰岩", (0.86, 0.83, 0.74, 1.0), rough=0.8)
M_WOOD   = mat("雪松木/步板", C_WOOD, rough=0.8)
M_VOID   = mat("未知空腔(μ子成像)", (0.72, 0.82, 0.95, 1.0), rough=0.4, alpha=0.35, emit=0.25)

# 集合
c_site   = new_collection("01_地形与坡道")
c_core   = new_collection("02_石核砌体")
c_inner  = new_collection("03_内部结构")
c_casing = new_collection("04_石灰岩外壳")
c_top    = new_collection("05_顶石与相机")

# 地形
ground = box("沙漠地表", c_site, (2600.0, 2.0, 2600.0), M_SAND, loc=(0.0, -3.0, 0.0))
plateau = box("吉萨高原基岩平台", c_site, (420.0, 4.0, 420.0), M_ROCK, loc=(0.0, -2.4, 0.0))

# 石核
layer_h = HEIGHT / N_CORE
core_objs = []
for i in range(N_CORE):
    z0 = i * layer_h
    b_half = HALF * (1.0 - z0 / HEIGHT)
    t_half = max(0.4, HALF * (1.0 - (z0 + layer_h) / HEIGHT) - TREAD)
    ob = slab("石核_层%02d" % (i + 1), c_core, b_half, t_half, layer_h * 1.002, M_CORE, z0)
    core_objs.append(ob)

# 石核生长
win = max(6, int((T_CORE_END - T_COURSE1) / (N_CORE + 4.0) * 0.75))
for i, ob in enumerate(core_objs):
    f0 = T_COURSE1 + int(i * (T_CORE_END - T_COURSE1) / float(N_CORE))
    grow(ob, f0, f0 + win)
    hide_anim(ob, f0)

# ---------------------------------------------------------- 内部连通结构
def I(ob, t0, t1, axis='Z'):
    f0, f1 = f_at(t0), f_at(t1)
    grow(ob, f0, f1, axis=axis)
    hide_anim(ob, f0)
    return ob

G0 = (0.0, 21.3, 41.4)
G1 = (0.0, 42.35, -1.6)

# ① 原入口 (17m) 与 26°31' 下降通道 (105m) + 马蒙盗墓道
I(tube("原入口与下降通道", c_inner, (0.0, 17.0, 101.8), (0.0, -29.9, 8.0), 1.04, 1.17, M_LIMEST), 0.15, 0.28, 'Z')
I(tube("马蒙盗墓道_水平段", c_inner, (0.0, 7.4, 109.6), (0.0, 7.4, 80.0), 0.9, 1.3, M_LIMEST), 0.16, 0.22, 'Z')
I(tube("马蒙盗墓道_斜接段", c_inner, (0.0, 7.4, 80.0), (0.3, 4.9, 77.2), 0.9, 1.3, M_LIMEST), 0.22, 0.26, 'Z')

# ② 地下墓室 (-27m, 14.1 x 8.4 x 4m) + 南墙死巷 + 服务竖井
I(tube("地下墓室水平甬道", c_inner, (0.0, -29.9, 8.0), (0.0, -29.9, 1.3), 0.9, 0.95, M_LIMEST), 0.18, 0.22, 'Z')
I(box("地下墓室", c_inner, (14.1, 4.0, 8.4), M_LIMEST, loc=(0.0, -31.9, -3.0)), 0.18, 0.26, 'Y')
I(box("地下墓室_未完工深坑", c_inner, (3.0, 4.4, 3.0), M_ROCK, loc=(2.6, -36.0, -3.0)), 0.20, 0.26, 'Y')
I(tube("地下墓室_南墙死巷", c_inner, (0.0, -30.2, -7.2), (0.0, -30.2, -23.0), 0.85, 1.0, M_LIMEST), 0.22, 0.28, 'Z')
I(tube("服务逃生竖井", c_inner, (-1.05, 22.6, 40.0), (-0.9, -27.8, 12.0), 0.85, 0.85, M_ROCK), 0.30, 0.38, 'Z')

# ③ 上升通道 (39.3m) + 3 块塞石
I(tube("上升通道", c_inner, (0.0, 3.8, 77.8), G0, 1.04, 1.17, M_LIMEST), 0.30, 0.37, 'Z')
for i, t_val in enumerate([0.06, 0.115, 0.17]):
    px = 0.0
    py = 3.8 + 17.5 * t_val
    pz = 77.8 - 36.4 * t_val
    I(box("塞石_%d" % (i + 1), c_inner, (1.0, 1.12, 1.5), M_GRANITE, loc=(px, py, pz)), 0.34, 0.37, 'Z')

# ④ 大画廊 (47.9m, 挑高 8.6m) + 7层叠涩 + 两侧坡台
I(tube("大画廊_主廊", c_inner, G0, G1, 2.06, 8.6, M_LIMEST), 0.42, 0.50, 'Z')
for layer in range(7):
    in_set = (layer + 1) * 0.076
    y_hgt = 2.29 + layer * 0.88
    for sgn in (-1.0, 1.0):
        box("大画廊挑檐_%d_%s" % (layer + 1, "W" if sgn < 0 else "E"), c_inner,
            (0.45, 0.38, 47.9), M_LIMEST,
            loc=(sgn * (1.03 - in_set + 0.22), 31.8 + layer * 0.9, 20.0),
            rot=(math.radians(-26.0), 0.0, 0.0))

# ⑤ 水平通道 -> 王后墓室 (位于南北正中 z=0, 5.23 x 5.75m, 人字梁 + 凹龛)
I(tube("王后水平甬道", c_inner, G0, (0.0, 21.3, 2.9), 1.05, 1.4, M_LIMEST), 0.30, 0.36, 'Z')
I(box("王后墓室", c_inner, (5.23, 6.2, 5.75), M_LIMEST, loc=(0.0, 24.4, 0.0)), 0.32, 0.39, 'Y')
for sgn in (-1.0, 1.0):
    I(box("王后人字梁_%s" % ("W" if sgn < 0 else "E"), c_inner,
          (5.4, 0.5, 3.4), M_LIMEST,
          loc=(0.0, 26.8, sgn * 1.45), rot=(sgn * math.radians(36.0), 0.0, 0.0)), 0.35, 0.39, 'Y')
I(box("王后东墙凹龛", c_inner, (0.4, 4.67, 1.5), M_CORE, loc=(2.45, 23.6, 0.0)), 0.34, 0.38, 'Y')
I(tube("王后北盲井", c_inner, (0.0, 22.5, 2.9), (0.0, 41.0, 30.0), 0.22, 0.22, M_LIMEST), 0.36, 0.40, 'Z')
I(tube("王后南盲井", c_inner, (0.0, 22.5, -2.9), (0.0, 43.0, -27.0), 0.22, 0.22, M_LIMEST), 0.36, 0.40, 'Z')

# ⑥ 闸门前厅 -> 国王墓室 (地面 43m, 10.47 x 5.23 x 5.84m, 镂空花岗岩石棺)
I(box("前厅", c_inner, (1.65, 3.8, 2.95), M_LIMEST, loc=(0.0, 44.3, -3.4)), 0.54, 0.58, 'Y')
for z_pos in (-2.7, -3.4, -4.1):
    I(box("花岗岩吊闸", c_inner, (1.42, 2.6, 0.18), M_GRANITE, loc=(0.0, 44.2, z_pos)), 0.55, 0.58, 'Y')
I(tube("国王墓室短甬道", c_inner, (0.0, 43.6, -4.8), (0.0, 43.6, -5.4), 1.05, 1.05, M_LIMEST), 0.55, 0.59, 'Z')
I(box("国王墓室", c_inner, (10.47, 5.84, 5.23), M_GRANITE, loc=(0.0, 45.92, -8.0)), 0.56, 0.63, 'Y')
I(box("花岗岩石棺", c_inner, (0.98, 1.05, 2.28), M_GRANITE, loc=(-3.85, 43.55, -8.0)), 0.60, 0.63, 'Y')

# ⑦ 5 层减压室 + 花岗岩大梁 + 顶层双人字梁
for i in range(5):
    cav_y = 49.7 + i * 1.55
    I(box("减压室_%d" % (i + 1), c_inner, (10.47, 0.95, 5.23), M_LIMEST, loc=(0.0, cav_y, -8.0)),
      0.57 + i * 0.014, 0.63 + i * 0.014, 'Y')
    if i < 4:
        I(box("花岗岩大梁_%d" % (i + 1), c_inner, (11.2, 0.6, 5.6), M_GRANITE, loc=(0.0, cav_y + 0.6, -8.0)),
          0.575 + i * 0.014, 0.635 + i * 0.014, 'Y')
I(box("减压室顶板", c_inner, (11.4, 0.7, 5.8), M_GRANITE, loc=(0.0, 56.7, -8.0)), 0.64, 0.67, 'Y')
for sgn in (-1.0, 1.0):
    I(box("人字梁_%s" % ("N" if sgn < 0 else "S"), c_inner,
          (11.6, 0.95, 4.2), M_LIMEST,
          loc=(0.0, 58.2, -8.0 + sgn * 1.65), rot=(sgn * math.radians(42.0), 0.0, 0.0)), 0.645, 0.675, 'Y')

# ⑧ 国王墓室通风井 (31° / 45° 穿透外立面)
I(tube("国王北通风井", c_inner, (2.0, 43.91, -3.3), (2.0, 78.0, 52.0), 0.2, 0.2, M_LIMEST), 0.66, 0.72, 'Z')
I(tube("国王南通风井", c_inner, (-2.0, 43.91, -12.7), (-2.0, 82.0, -50.0), 0.2, 0.2, M_LIMEST), 0.67, 0.73, 'Z')

# ⑨ 2017 大空腔 (30m) + 2016 隐藏走廊
I(box("大空腔_2017", c_inner, (6.0, 7.0, 30.0), M_VOID, loc=(0.0, 44.0, 17.0)), 0.62, 0.70, 'Y')
I(tube("隐藏走廊_2016", c_inner, (0.0, 28.6, 3.5), (1.8, 31.5, 12.0), 1.5, 1.6, M_VOID), 0.44, 0.50, 'Z')

# ---------------------------------------------------------- 白色外壳
ch = HEIGHT / N_CASING
for i in range(N_CASING):
    z0 = i * ch
    b_half = HALF * (1.0 - z0 / HEIGHT)
    t_half = HALF * (1.0 - (z0 + ch) / HEIGHT)
    ob = slab("外壳_层%02d" % (i + 1), c_casing, b_half * 1.001, t_half * 1.001, ch * 1.004, M_CASING, z0)
    f0 = T_CASING + int((N_CASING - 1 - i) * (T_CASING_E - T_CASING) / float(N_CASING))
    grow(ob, f0, f0 + max(6, int((T_CASING_E - T_CASING) / (N_CASING + 6.0) * 0.8)))
    hide_anim(ob, f0)

# 顶石
TOP_H = 2.6
TOP_HALF = HALF * (1.0 - (HEIGHT - TOP_H) / HEIGHT)
pyramidion = slab("顶石_Pyramidion", c_top, TOP_HALF, 0.02, TOP_H, M_GOLD, HEIGHT - TOP_H)
pyramidion.location = (0.0, 0.0, HEIGHT + 34.0)
pyramidion.keyframe_insert(data_path='location', frame=T_TOP)
pyramidion.location = (0.0, 0.0, HEIGHT - TOP_H)
pyramidion.keyframe_insert(data_path='location', frame=T_FIN * 1.0)
hide_anim(pyramidion, T_TOP)

# 相机运镜
cam_data = bpy.data.cameras.new("相机")
cam_data.lens = 38.0
cam_data.clip_end = 5000.0
cam = bpy.data.objects.new("相机", cam_data)
c_top.objects.link(cam)
sc.camera = cam

target = bpy.data.objects.new("相机目标", None)
c_top.objects.link(target)
target.location = (0.0, 0.0, 45.0)
con = cam.constraints.new(type='TRACK_TO')
con.target = target
con.track_axis = 'TRACK_NEGATIVE_Z'
con.up_axis = 'UP_Y'

def place(az_deg, el_deg, dist, ty, frame):
    az, el = math.radians(az_deg), math.radians(el_deg)
    cam.location = (dist * math.cos(el) * math.sin(az),
                    -dist * math.cos(el) * math.cos(az),
                    ty + dist * math.sin(el))
    cam.keyframe_insert(data_path='location', frame=frame)
    target.location = (0.0, 0.0, ty)
    target.keyframe_insert(data_path='location', frame=frame)

shots = [(1, 34, 32, 460, 40), (f_at(0.08), 74, 24, 440, 40), (f_at(0.30), 24, 26, 450, 50),
         (f_at(0.44), 118, 30, 460, 55), (f_at(0.58), 168, 24, 450, 55),
         (f_at(0.68), 212, 30, 460, 60), (f_at(0.80), 286, 24, 460, 60),
         (f_at(0.93), 336, 26, 460, 65), (F, 392, 24, 460, 65)]
for (fr, az, el, dist, ty) in shots:
    place(az, el, dist, ty, fr)
set_ease(cam)
set_ease(target)

# 剖切参考方块
cut = box("剖切方块_东北象限", c_top, (HALF * 2.4, HEIGHT * 1.6, HALF * 2.4), M_ROCK,
          loc=(HALF * 1.1, HEIGHT * 0.7, HALF * 1.1))
cut.display_type = 'WIRE'
cut.hide_render = True
cut.hide_set(True)
for ob in core_objs + [o for o in c_casing.objects]:
    try:
        md = ob.modifiers.new("剖切(Boolean)", type='BOOLEAN')
        md.operation = 'DIFFERENCE'
        md.object = cut
        md.show_viewport = False
        md.show_render = False
    except Exception:
        pass

# 保存 / 导出
print("\n构建完成：石核 %d 层 / 外壳 %d 层 / 内部连通构件 %d 个" % (N_CORE, N_CASING, len(c_inner.objects)))
sc.frame_set(FRAME_END)
bpy.context.view_layer.update()
# 保存的默认视图直接展示完成态，不让新打开的工程看起来是空场景。
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.clip_end = 5000.0
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
try:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    print("已保存工程文件 ->", BLEND_PATH)
except Exception as e:
    raise RuntimeError('保存 .blend 失败：%s\n%s' % (BLEND_PATH, e)) from e

try:
    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH, export_format='GLB',
        use_active_scene=True, use_renderable=True,
        export_current_frame=True, export_animations=True,
        export_animation_mode='SCENE', export_anim_scene_split_object=False,
        export_frame_range=True,
        export_cameras=True, export_force_sampling=True,
    )
    print("已导出预览文件 ->", GLB_PATH)
except Exception as e:
    raise RuntimeError('.blend 已保存到 %s，但 GLB 导出失败：%s。请确认 Blender 的 glTF 2.0 导出插件可用。' % (BLEND_PATH, e)) from e

sc.frame_set(FRAME_END)
print('完成！输出目录：', OUT_DIR)
if not bpy.app.background:
    def show_result(self, context):
        self.layout.label(text='已生成 .blend 工程和 .glb 动画模型')
        self.layout.label(text=OUT_DIR)
        self.layout.label(text='当前为完成态；跳到第 1 帧即可播放建造动画')
    bpy.context.window_manager.popup_menu(show_result, title='胡夫金字塔导出完成', icon='CHECKMARK')
