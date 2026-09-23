// 下载、复制和静态链接共用同一份脚本，构建时内嵌到单文件网页。
import script from '../../public/khufu_great_pyramid.py?raw';
import readme from '../../public/khufu_README.txt?raw';

export const PY_FILENAME = 'khufu_great_pyramid.py';
export const BLEND_FILENAME = 'khufu_great_pyramid.blend';
export const GLB_FILENAME = 'khufu_great_pyramid.glb';
export const README_FILENAME = 'khufu_README.txt';
export const BLENDER_SCRIPT = script;
export const BLENDER_README = readme;
