import { useRef, useState } from 'react';
import { BLENDER_SCRIPT, BLENDER_README, PY_FILENAME, README_FILENAME, BLEND_FILENAME, GLB_FILENAME } from '../data/blenderScript';
import { copyText, downloadTextFile } from '../utils/textDownload';
import { Btn, Panel } from './ui';

export default function BlenderExport({ onClose }: { onClose: () => void }) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [downloadMessage, setDownloadMessage] = useState('');
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const copied = copyStatus === 'copied';

  const handleCopy = async () => {
    setCopyStatus('idle');
    setCopyStatus(await copyText(BLENDER_SCRIPT, textAreaRef.current) ? 'copied' : 'manual');
  };

  const handleDownload = (filename: string, text: string, mime: string) => {
    const isScript = filename === PY_FILENAME;
    try {
      downloadTextFile(filename, text, mime);
      setDownloadMessage(`已发起 ${filename} 下载。若未保存，请检查浏览器下载列表${isScript ? '，或复制代码保存为 .py 文件' : ''}。`);
    } catch {
      setDownloadMessage(isScript
        ? '浏览器未能发起下载。请复制右侧代码，在文本编辑器中以 UTF-8 保存为 .py 文件。'
        : '浏览器未能发起说明文档下载。请参照本面板的运行步骤，或换浏览器重试。');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-md sm:p-8">
      <Panel className="w-full max-w-4xl p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/20 text-base text-orange-400">
                🐍
              </span>
              <h2 className="text-base font-semibold text-white sm:text-lg">
                Blender 工程生成脚本
              </h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              下载 Python 脚本，在本地 Blender 中运行后生成
              <code className="mx-1 text-amber-200">{BLEND_FILENAME}</code> 与
              <code className="text-amber-200">{GLB_FILENAME}</code>。
              包含简化建筑与内部结构示意、480 帧建造动画与相机运镜；GLB 含合并为单轨的建造动画。
              工人和今日风化外观仅在网页预览中提供。
            </p>
          </div>
          <Btn onClick={onClose} title="关闭">
            ✕
          </Btn>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {/* 左列：操作与指引 */}
          <div className="space-y-4">
            <div>
              <h3 className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
                步骤 1：下载或复制 Python 脚本
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(PY_FILENAME, BLENDER_SCRIPT, 'text/x-python;charset=utf-8')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-amber-300 to-amber-500 px-3.5 py-2 text-xs font-semibold text-[#2a1c04] shadow-lg shadow-amber-500/20 transition hover:from-amber-200 hover:to-amber-400 active:scale-[.97]"
                >
                  ⬇ 下载 .py 生成脚本
                </button>
                {/* 一键复制 */}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-400/20"
                >
                  {copied ? '✓ 已成功复制到剪贴板！' : '⧉ 复制全部代码'}
                </button>
              </div>
              <p role="status" className="mt-2 text-[11px] leading-relaxed text-slate-400">{downloadMessage}</p>
              {copyStatus === 'manual' && (
                <p role="alert" className="mt-2 text-xs leading-relaxed text-amber-200">
                  自动复制失败，已选中代码。请按 ⌘C（Mac）或 Ctrl+C（Windows）手动复制。
                </p>
              )}
            </div>

            <div>
              <h3 className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
                步骤 2：在 Blender 中运行（已实测 5.2.1）
              </h3>
              <ol className="mt-2 space-y-2 text-xs leading-relaxed text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-300/20 font-mono text-[11px] font-bold text-amber-200">
                    1
                  </span>
                  <span>
                    打开 <b className="text-white">Blender</b> 的空白工程，在顶部标签栏切换到{' '}
                    <b className="text-amber-200">Scripting</b>（脚本编辑）工作区。
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-300/20 font-mono text-[11px] font-bold text-amber-200">
                    2
                  </span>
                  <span>
                    在 <b className="text-white">文本编辑器</b> 内点 <b className="text-white">Open</b>，选择{' '}
                    <code className="text-amber-200">{PY_FILENAME}</code>（或点 New 后粘贴代码）。
                    .py 文件不能用左上角 File → Open 打开。
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-300/20 font-mono text-[11px] font-bold text-amber-200">
                    3
                  </span>
                  <span>
                    点文本编辑器右上角的 <b className="text-emerald-300">▶ Run Script</b> 按钮（或按快捷键{' '}
                    <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[10px]">Alt + P</kbd>）。
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-300/20 font-mono text-[11px] font-bold text-amber-200">
                    4
                  </span>
                  <span>
                    等待运行结束，前往 <code className="text-amber-200">~/Downloads/KhufuPyramid</code> 查看生成文件。
                    打开 .blend 后先将时间轴跳到第 1 帧，再按空格播放建造动画。耗时取决于设备；输出目录可在脚本的 OUT_DIR 中修改。
                  </span>
                </li>
              </ol>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-3">
              <div className="mb-1 text-[11px] font-medium text-slate-400">也可以在 Mac 终端直接一条命令执行：</div>
              <code className="block font-mono text-[10.5px] leading-relaxed break-all text-emerald-300">
                {'/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python "$HOME/Downloads/'}{PY_FILENAME}{'" -- --output-dir "$HOME/Downloads/KhufuPyramid"'}
              </code>
            </div>

            <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
              <button type="button" onClick={() => handleDownload(README_FILENAME, BLENDER_README, 'text/plain;charset=utf-8')} className="text-amber-300 underline hover:text-amber-200">
                下载 README.txt 说明文档
              </button>
            </div>
          </div>

          {/* 右列：代码预览与一键选择 */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black/50">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 font-mono text-[11px] text-slate-400">
              <span>{PY_FILENAME} · 完整 Python 脚本</span>
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs text-amber-300 hover:text-amber-200 hover:underline"
              >
                {copied ? '✓ 已复制' : '复制全部'}
              </button>
            </div>
            <textarea
              ref={textAreaRef}
              readOnly
              aria-label="Blender Python 生成脚本"
              value={BLENDER_SCRIPT}
              className="h-[360px] w-full resize-none bg-transparent p-3 font-mono text-[11px] leading-relaxed text-slate-300 outline-none select-all"
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4 text-xs text-slate-400">
          <span>包含：40 层石核 + 40 层外壳 + 通道与墓室示意 + 480 帧建造动画</span>
          <Btn onClick={onClose}>完成并返回 3D 预览</Btn>
        </div>
      </Panel>
    </div>
  );
}
