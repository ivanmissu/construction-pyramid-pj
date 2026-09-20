胡夫金字塔 · Blender 5.2 工程生成包
======================================================

包内文件：
  khufu_great_pyramid.py   Blender Python 生成脚本（兼容 Blender 5.2 / 4.x）

一、直接在 Blender 5.2 运行生成 .blend 文件（推荐）
 1. 打开 Blender 5.2
 2. 顶部工作区标签 -> Scripting
 3. 点 Open 选择 khufu_great_pyramid.py  ->  点 ▶ Run Script （或按 Alt+P）
 4. 脚本会自动：按 1:1 米制精度建模 -> 打 480 帧建造关键帧动画 -> 渲染设置 -> 自动保存
    桌面将生成：
      ~/Desktop/khufu_great_pyramid.blend     ← 可编辑的完整工程文件
      ~/Desktop/khufu_great_pyramid.glb       ← 浏览器 3D 预览文件

二、命令行生成（macOS 终端一条命令）
   /Applications/Blender.app/Contents/MacOS/Blender --background \
      --python ~/Desktop/khufu_great_pyramid.py

三、在 Blender 中查看内部连通结构
  · 在右上角 Outliner 集合面板里关闭 "04_石灰岩外壳" 的眼睛图标，即可透视内部全部连通空间
  · 选中 "02_石核砌体" 或 "04_石灰岩外壳" 中的物体，在修改器面板启用预置的 Boolean(剖切方块)，即可得到东北象限四分之一剖切视图

四、核心建筑数据基准
  - 底边 230.33 m，原高 146.60 m，坡度 51°50'40"
  - 内部全部首尾连通：北面 17m 入口 ─ 26°31' 下降通道 ─ 分叉口 ─ 26°02' 上升通道 ─ 大画廊(7层叠涩+两侧坡道) ─ 闸门前厅 ─ 国王墓室(镂空石棺+5层减压室) ─ 王后墓室(人字顶+5层叠涩凹龛) ─ 地下墓室
