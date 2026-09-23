胡夫金字塔 · Blender 工程生成脚本
======================================================

下载文件：khufu_great_pyramid.py
这是需要在 Blender 内运行的 Python 脚本，不是可直接打开的 .blend 工程。
已实测 Blender 5.2.1；无需安装额外 Python 包，不要使用系统 Python 执行。

一、在 Blender 中生成工程
 1. 打开 Blender 的空白工程，切换到顶部 Scripting 工作区。
 2. 在“文本编辑器”中点 Open，选择 khufu_great_pyramid.py。
    也可点 New，然后粘贴网页上复制的完整脚本。
    注意：左上角 File -> Open 用于打开 .blend，不能用来打开 .py 脚本。
 3. 在文本编辑器内点 ▶ Run Script（或将鼠标放在编辑器内，按 Alt+P）。
 4. 等待运行结束，生成时间取决于设备性能。
    默认输出到当前用户的下载目录：
      ~/Downloads/KhufuPyramid/khufu_great_pyramid.blend
      ~/Downloads/KhufuPyramid/khufu_great_pyramid.glb
    脚本会创建输出目录。自定义位置可修改脚本中的 OUT_DIR。
 5. 打开生成的 .blend 时显示第 480 帧的建成状态。
    先将时间轴跳到第 1 帧，再按空格播放 480 帧、24 fps 的建造动画。
    按数字键盘 0 查看相机视角；没有数字键盘时使用 View -> Cameras -> Active Camera。

二、命令行生成
 macOS（Blender 安装在 /Applications/Blender.app，脚本保存在 Downloads 时）：

 /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python "$HOME/Downloads/khufu_great_pyramid.py" -- --output-dir "$HOME/Downloads/KhufuPyramid"

 如果脚本保存在其他位置，请替换 --python 后的路径。
 Windows / Linux：使用本机 Blender 可执行文件路径，同样传入 --background、
 --factory-startup、--python-exit-code 1、--python 和 -- --output-dir 参数。
 包含空格的路径必须使用引号。

三、查看内部结构
 · 在右上角 Outliner 集合面板中，同时隐藏“02_石核砌体”和“04_石灰岩外壳”，
   查看通道与墓室的几何示意。它们是实体构造示意，并非可直接漫游的空心空间。
 · 石核与外壳物体带有默认关闭的 Boolean 剖切修改器；需要四分之一剖面时，
   在修改器面板启用对应的视口/渲染开关。剖切工具本身默认隐藏，不应显示为实心方块。

四、内容范围
 · 以底边 230.33 m、原高 146.60 m 为尺寸基准的简化构造模型。
 · 40 层石核、40 层外壳、通道与墓室、减压室和通风井示意。
 · .blend 为可编辑工程，包含建造动画、材质、灯光和相机。
 · .glb 包含合并为单轨的完整建造动画，默认姿态为建成模型。
 · 包含简化建筑与内部结构示意；工人和今日风化外观仅在网页预览中提供。

五、下载或运行遇到问题
 · 页面通过内嵌内容下载脚本，可用于独立 HTML 文件和子目录部署。
 · 点击下载后检查浏览器的下载列表。若浏览器限制下载，复制页面代码，
   以 UTF-8 纯文本保存为 khufu_great_pyramid.py，确认没有附加 .txt 扩展名。
 · 自动复制失败时，页面会选中代码；按 Cmd+C（Mac）或 Ctrl+C（Windows）手动复制。
 · 运行失败时查看 Blender 报错，检查输出目录权限和磁盘空间。
   命令行运行会直接显示错误信息；请保留完整报错以便定位。
