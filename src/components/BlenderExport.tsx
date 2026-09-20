import { useRef, useState } from 'react';
import { BLENDER_SCRIPT, PY_FILENAME, BLEND_FILENAME, GLB_FILENAME } from '../data/blenderScript';
import { Btn, Panel } from './ui';

function triggerBrowserDownload(name: string, content: string) {
  try {
    const dataUri = 'data:text/x-python;charset=utf-8,' + encodeURIComponent(content);
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    const blob = new Blob([content], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

export default function BlenderExport({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleCopy = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(BLENDER_SCRIPT).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        fallbackCopy();
      });
    } else {
      fallbackCopy();
    }
  };

  const fallbackCopy = () => {
    if (textAreaRef.current) {
      textAreaRef.current.select();
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
                Blender 5.2 工程生成器 · 导出与下载
              </h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Blender 二进制 <code className="text-amber-200">.blend</code> 文件需由 Blender 引擎在本地生成。
              运行该 Python 脚本，即可在桌面一键产出
              <code className="mx-1 text-amber-200">{BLEND_FILENAME}</code> 与
              <code className="text-amber-200">{GLB_FILENAME}</code>（含全部连通通道、墓室、480 帧建造动画与相机运镜）。
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
                步骤 1：获取脚本文件（多种方式）
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {/* 静态文件直链下载 */}
                <a
                  href={`/${PY_FILENAME}`}
                  download={PY_FILENAME}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-amber-300 to-amber-500 px-3.5 py-2 text-xs font-semibold text-[#2a1c04] shadow-lg shadow-amber-500/20 transition hover:from-amber-200 hover:to-amber-400 active:scale-[.97]"
                >
                  ⬇ 立即下载 {PY_FILENAME}
                </a>
                {/* 备用动态下载 */}
                <button
                  type="button"
                  onClick={() => triggerBrowserDownload(PY_FILENAME, BLENDER_SCRIPT)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-white/25 hover:text-white"
                >
                  备用下载 (DataURI)
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
            </div>

            <div>
              <h3 className="text-[11px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
                步骤 2：在 Mac 上的 Blender 5.2 中运行
              </h3>
              <ol className="mt-2 space-y-2 text-xs leading-relaxed text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-300/20 font-mono text-[11px] font-bold text-amber-200">
                    1
                  </span>
                  <span>
                    打开 Mac 上的 <b className="text-white">Blender 5.2.1</b>，在顶部标签栏切换到{' '}
                    <b className="text-amber-200">Scripting</b>（脚本编辑）工作区。
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-300/20 font-mono text-[11px] font-bold text-amber-200">
                    2
                  </span>
                  <span>
                    点顶部菜单中的 <b className="text-white">Open</b>（打开），选中刚下载的{' '}
                    <code className="text-amber-200">{PY_FILENAME}</code>（或点新建并粘贴代码）。
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
                    3 秒后生成完成！桌面将自动生成{' '}
                    <b className="text-white">{BLEND_FILENAME}</b> 和{' '}
                    <b className="text-white">{GLB_FILENAME}</b>。按空格键即可播放 20 秒建造动画！
                  </span>
                </li>
              </ol>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-3">
              <div className="mb-1 text-[11px] font-medium text-slate-400">也可以在 Mac 终端直接一条命令执行：</div>
              <code className="block font-mono text-[10.5px] leading-relaxed break-all text-emerald-300">
                /Applications/Blender.app/Contents/MacOS/Blender --background --python ~/Desktop/{PY_FILENAME}
              </code>
            </div>

            <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
              <a href="/khufu_README.txt" download="khufu_README.txt" className="text-amber-300 underline hover:text-amber-200">
                下载 README.txt 说明文档
              </a>
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
              value={BLENDER_SCRIPT}
              className="h-[360px] w-full resize-none bg-transparent p-3 font-mono text-[11px] leading-relaxed text-slate-300 outline-none select-all"
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4 text-xs text-slate-400">
          <span>包含：40 层石核 + 40 层外壳 + 全部连通通道与墓室 + 5 层减压室 + 4 条通风井 + 480 帧建造动画</span>
          <Btn onClick={onClose}>完成并返回 3D 预览</Btn>
        </div>
      </Panel>
    </div>
  );
}
