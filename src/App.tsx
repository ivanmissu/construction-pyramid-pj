import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Viewer, { type ViewerHandle } from './components/Viewer';
import BlenderExport from './components/BlenderExport';
import { Btn, IconToggle, Panel, Row, SectionTitle } from './components/ui';
import { DIMS, FEATURES, STATIONS, STEPS, VIEW_MODES, activeStep, type ViewModeId } from './data/reference';
import { cn } from './utils/cn';

type Flags = {
  mode: ViewModeId;
  progress: number;
  playing: boolean;
  speed: number;
  autoCamera: boolean;
  autoRotate: boolean;
  wireframe: boolean;
  showLabels: boolean;
  showEdges: boolean;
  /** 光线追踪式渲染（GTAO 环境光遮蔽 + 泛光） */
  rayTracing: boolean;
};

const CAM_PRESETS = [
  { label: '全景', az: 46, el: 22, dist: 40, y: HEIGHTY(0.4) },
  { label: '北面入口', az: 4, el: 6, dist: 20, y: HEIGHTY(0.1) },
  { label: '剖面视角', az: 132, el: 24, dist: 30, y: HEIGHTY(0.28) },
  { label: '俯视', az: 30, el: 76, dist: 34, y: HEIGHTY(0.12) },
];
function HEIGHTY(k: number) {
  return DIMS.height * 0.1 * k;
}

export default function App() {
  const viewer = useRef<ViewerHandle | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [flags, setFlags] = useState<Flags>({
    // 打开页面默认播放建造动画（progress 从 0 起），看一步一块石头从基岩砌到顶
    mode: 'solid',
    progress: 0,
    playing: true,
    speed: 1,
    autoCamera: true,
    autoRotate: false,
    wireframe: false,
    showLabels: true,
    showEdges: true,
    rayTracing: true, // 默认开启光线追踪（环境光遮蔽 + 泛光）
  });
  const [station, setStation] = useState(0);
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [glbInfo, setGlbInfo] = useState<{ name: string; duration: number; clips: string[] } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 80);
    return () => clearTimeout(t);
  }, []);

  const patch = useCallback((p: Partial<Flags>) => setFlags((f) => ({ ...f, ...p })), []);
  const step = useMemo(() => activeStep(flags.progress), [flags.progress]);
  const feature = FEATURES.find((f) => f.id === activeFeature) ?? null;

  const onProgress = useCallback((p: number) => {
    setFlags((f) => (Math.abs(f.progress - p) < 0.012 && p < 1 ? f : { ...f, progress: p }));
  }, []);
  // 只在用户“真的拖动/滚轮改变了机位”时才取消自动运镜；
  // 单纯点击塔身不应把“自动运镜”取消勾选
  const onUserInteract = useCallback(() => {
    setFlags((f) => (f.autoCamera || f.autoRotate ? { ...f, autoCamera: false, autoRotate: false } : f));
  }, []);

  /* ---------------- 进入 / 退出内部 ---------------- */
  const isInside = flags.mode === 'inside';
  const isExterior = flags.mode === 'solid' || flags.mode === 'today';

  const enterInterior = useCallback(
    (i = 0) => {
      setStation(i);
      viewer.current?.enterInterior(i);
      patch({ mode: 'inside', progress: 1, playing: false, autoCamera: false, autoRotate: false });
    },
    [patch],
  );

  const exitInterior = useCallback(
    (mode: ViewModeId = 'solid') => {
      viewer.current?.exitInterior();
      patch({ playing: false, autoCamera: false, autoRotate: false });
      // 等外部外壳淡入的转场播完，再切回外部观察模式（否则会硬切）
      window.setTimeout(() => patch({ mode, autoRotate: mode === 'solid' }), 1800);
    },
    [patch],
  );

  const gotoStation = useCallback((i: number) => {
    const next = (i + STATIONS.length) % STATIONS.length;
    setStation(next);
    viewer.current?.gotoStation(next);
  }, []);

  /* 键盘 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        patch({ playing: !flags.playing });
      } else if (e.key === 'ArrowLeft') patch({ progress: Math.max(0, flags.progress - 0.02), playing: false });
      else if (e.key === 'ArrowRight') patch({ progress: Math.min(1, flags.progress + 0.02), playing: false });
      else if (e.key.toLowerCase() === 'r') viewer.current?.resetCamera();
      else if (e.key.toLowerCase() === 'l') patch({ showLabels: !flags.showLabels });
      else if (e.key === 'Escape' && isInside) exitInterior('solid');
      else if (e.key === 'Enter' && !isInside) enterInterior(0);
      else if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        const m = VIEW_MODES[+e.key - 1];
        if (m.id === 'inside') enterInterior(0);
        else if (isInside) exitInterior(m.id);
        else patch({ mode: m.id });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enterInterior, exitInterior, flags.playing, flags.progress, flags.showLabels, isInside, patch]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#070a11] text-slate-100 select-none">
      <Viewer
        ref={viewer}
        flags={flags}
        onProgress={onProgress}
        onPlayingChange={(p) => patch({ playing: p })}
        onUserInteract={onUserInteract}
        onEnter={() => enterInterior(0)}
      />

      {/* 顶部标题 */}
      <header className="pointer-events-none absolute top-0 left-0 z-20 flex w-full items-start justify-between gap-3 p-3 sm:p-4">
        <Panel className="pointer-events-auto flex items-center gap-3 px-3 py-2 sm:px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-200 to-amber-500 text-[#2b1d05]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M12 3 2 20h20L12 3Zm0 4.2 6.2 10.4H5.8L12 7.2Z" />
            </svg>
          </div>
          <div className="leading-tight">
            <h1 className="text-[13px] font-semibold tracking-tight text-white sm:text-sm">
              胡夫金字塔 · 3D 构造图与建造动画
            </h1>
            <p className="text-[10.5px] text-slate-400">
              Great Pyramid of Khufu · 外立面 + 内部结构 + 建造过程 ｜ 与 Blender 5.2 工程同源数据
            </p>
          </div>
        </Panel>
        <div className="pointer-events-auto flex items-center gap-2">
          <Btn variant="gold" onClick={() => setShowExport(true)}>
            ⬇ Blender 5.2 工程文件
          </Btn>
          <button
            type="button"
            onClick={() => setDrawer((d) => !d)}
            className="rounded-xl border border-white/10 bg-[#0d1117]/80 px-3 py-2 text-xs text-slate-300 backdrop-blur-xl lg:hidden"
          >
            ☰ 面板
          </button>
        </div>
      </header>

      {/* 左侧面板 */}
      <aside
        className={cn(
          'absolute top-20 bottom-32 left-3 z-30 w-[19rem] max-w-[85vw] space-y-3 overflow-y-auto pr-1 transition-transform duration-300 sm:left-4',
          drawer ? 'translate-x-0' : '-translate-x-[110%] lg:translate-x-0',
        )}
      >
        {isInside && (
          <Panel className="border-amber-300/30 p-3">
            <SectionTitle
              right={
                <span className="font-mono text-[10px] text-amber-200">
                  {station + 1} / {STATIONS.length}
                </span>
              }
            >
              内部巡检
            </SectionTitle>
            <div className="mb-2 flex items-center gap-1.5">
              <Btn className="flex-1" onClick={() => gotoStation(station - 1)}>
                ← 上一站
              </Btn>
              <Btn className="flex-1" onClick={() => gotoStation(station + 1)}>
                下一站 →
              </Btn>
            </div>
            <div className="flex flex-wrap gap-1">
              {STATIONS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => gotoStation(i)}
                  title={s.name}
                  className={cn(
                    'rounded-md border px-2 py-1 text-[10.5px] transition',
                    i === station
                      ? 'border-amber-300/60 bg-amber-300/15 text-amber-100'
                      : 'border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200',
                  )}
                >
                  {s.short}
                </button>
              ))}
            </div>
            <Btn variant="gold" className="mt-2 w-full" onClick={() => exitInterior('solid')}>
              ⤺ 退出金字塔 · 回到外部
            </Btn>
            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
              内部视角可自由旋转/缩放（Esc 或按钮退出，⌘ 状态下拖动查看四周）
            </p>
          </Panel>
        )}

        <Panel className="p-3">
          <SectionTitle right={glbInfo ? <span className="text-[10px] text-emerald-300">GLB 预览中</span> : undefined}>
            观察视图
          </SectionTitle>
          <div className="space-y-1.5">
            {VIEW_MODES.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  if (m.id === 'inside') return enterInterior(0);
                  if (isInside) return exitInterior(m.id);
                  patch(
                    m.id === 'solid' || m.id === 'today'
                      ? { mode: m.id, progress: 1, playing: false, autoCamera: false }
                      : { mode: m.id },
                  );
                }}
                className={cn(
                  'w-full rounded-lg border px-2.5 py-2 text-left transition',
                  flags.mode === m.id
                    ? 'border-amber-300/60 bg-amber-300/10'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn('text-xs font-medium', flags.mode === m.id ? 'text-amber-100' : 'text-slate-200')}>
                    {m.label}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">{i + 1}</span>
                </div>
                <div className="mt-0.5 text-[10.5px] leading-snug text-slate-500">{m.hint}</div>
              </button>
            ))}
          </div>
          <div className={cn('mt-3 grid grid-cols-2 gap-1.5', isInside && 'hidden')}>
            {CAM_PRESETS.map((c) => (
              <Btn
                key={c.label}
                onClick={() => {
                  patch({ autoCamera: false });
                  viewer.current?.cameraPreset(c.az, c.el, c.dist, c.y);
                }}
              >
                {c.label}
              </Btn>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <IconToggle active={flags.autoRotate} onClick={() => patch({ autoRotate: !flags.autoRotate })} icon="⟳" label="自转" />
            <IconToggle
              active={flags.mode === 'solid'}
              onClick={() => patch({ mode: 'solid', progress: 1, playing: false, autoCamera: false })}
              icon="✔"
              label="建成原貌"
              title="约公元前 2560 年落成时：满铺白色外壳 + 镀金顶石"
            />
            <IconToggle
              active={flags.mode === 'today'}
              onClick={() => patch({ mode: 'today', progress: 1, playing: false, autoCamera: false })}
              icon="◲"
              label="今日现状"
              title="今天：外壳剥落、顶石缺失，只见阶梯状石核"
            />
            <IconToggle active={flags.showLabels} onClick={() => patch({ showLabels: !flags.showLabels })} icon="🏷" label="标注" title="建造播放中仅显示当前施工构件的标签，暂停后显示全部" />
            <IconToggle active={flags.showEdges} onClick={() => patch({ showEdges: !flags.showEdges })} icon="▦" label="层线" />
            <IconToggle active={flags.wireframe} onClick={() => patch({ wireframe: !flags.wireframe })} icon="⌗" label="线框" />
            <IconToggle
              active={flags.rayTracing}
              onClick={() => patch({ rayTracing: !flags.rayTracing })}
              icon="✦"
              label="光线追踪"
              title="GTAO 环境光遮蔽 + 泛光，让石缝、棱线与墓室墙角呈现真实接触阴影"
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <Btn onClick={() => viewer.current?.screenshot()}>📷 截图</Btn>
            <Btn onClick={() => viewer.current?.resetCamera()}>⌖ 复位</Btn>
            <Btn onClick={() => fileRef.current?.click()}>📂 .glb</Btn>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".glb,.gltf"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const res = await viewer.current?.loadGLB(f);
              setGlbInfo({ name: f.name, duration: res?.duration ?? 0, clips: res?.clips ?? [] });
              patch({ playing: true, progress: 0, autoCamera: false });
            }}
          />
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            左键拖动旋转 · 滚轮缩放 · 右键平移 ｜ 点击视图内的结构标签可直接飞向该处
          </p>
          {glbInfo && (
            <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-2">
              <div className="text-[10.5px] text-emerald-200">
                已载入 {glbInfo.name} · {glbInfo.clips.length} 个动画 · {glbInfo.duration.toFixed(1)} s
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-400">时间轴现在映射到 glTF 动画</span>
                <button
                  type="button"
                  className="text-[10px] text-slate-300 underline"
                  onClick={() => {
                    viewer.current?.clearGLB();
                    setGlbInfo(null);
                    patch({ progress: 0 });
                  }}
                >
                  移除
                </button>
              </div>
            </div>
          )}
        </Panel>

        <Panel className="p-3">
          <SectionTitle right={<span className="text-[10px] text-slate-500">{FEATURES.length} 处</span>}>
            内部结构清单
          </SectionTitle>
          <div className="space-y-1">
            {FEATURES.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setActiveFeature(f.id);
                  viewer.current?.focusFeature(f.id);
                  patch({
                    mode: flags.mode === 'solid' || flags.mode === 'today' ? 'translucent' : flags.mode,
                    autoCamera: false,
                  });
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition',
                  activeFeature === f.id ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]',
                )}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: f.color, boxShadow: `0 0 10px ${f.color}` }}
                />
                <span className="flex-1 truncate text-[11.5px] text-slate-200">{f.name}</span>
                <span className="font-mono text-[9.5px] text-slate-500">定位</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="p-3">
          <SectionTitle>测绘基准数据</SectionTitle>
          <Row label="底边边长" value={`${DIMS.baseSide} m`} />
          <Row label="原高 / 现高" value={`${DIMS.height} / 137.5 m`} />
          <Row label="坡度" value={`51°50′40″`} />
          <Row label="砌石层数" value={`约 ${DIMS.courses} 层`} />
          <Row label="石材总量" value={`约 ${(DIMS.blocks / 1e4).toFixed(0)} 万块`} />
          <Row label="体积 / 均重" value={`${(DIMS.volumeM3 / 1e4).toFixed(0)} 万 m³ · 2.5 t`} />
          <Row label="底面面积" value={`${DIMS.baseArea} 万 m²`} />
          <Row label="方位误差" value={`${DIMS.azimuthError}° (3′6″)`} />
          <Row label="纬度" value={`${DIMS.latitude}° N`} />
          <Row label="入口高度" value={`${DIMS.entranceHeight} m`} />
        </Panel>
      </aside>

      {/* 右侧信息卡 */}
      <div className="pointer-events-none absolute top-20 right-3 z-20 hidden w-[20rem] space-y-3 sm:right-4 xl:block">
        {isInside && (
          <Panel className="pointer-events-auto border-amber-300/30 p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-300/20 text-[11px] text-amber-100">
                {station + 1}
              </span>
              <h3 className="text-[13px] font-semibold text-amber-100">{STATIONS[station].name}</h3>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-slate-300">{STATIONS[station].desc}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <Btn className="flex-1" onClick={() => gotoStation(station - 1)}>
                ← 上一站
              </Btn>
              <Btn className="flex-1" onClick={() => gotoStation(station + 1)}>
                下一站 →
              </Btn>
            </div>
          </Panel>
        )}
        {feature && (
          <Panel className="pointer-events-auto p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: feature.color }} />
                  <h3 className="text-[13px] font-semibold text-white">{feature.name}</h3>
                </div>
                <div className="mt-0.5 text-[10px] tracking-wide text-slate-500">{feature.en}</div>
              </div>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-white"
                onClick={() => setActiveFeature(null)}
              >
                ✕
              </button>
            </div>
            <div className="mt-2 rounded-md bg-white/[0.04] px-2 py-1.5 font-mono text-[10.5px] text-amber-100">
              {feature.dims}
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-slate-300">{feature.desc}</p>
          </Panel>
        )}
        <Panel className="pointer-events-auto p-3.5">
          <SectionTitle>
            工序 {STEPS.findIndex((s) => s.id === step.id) + 1} / {STEPS.length}
          </SectionTitle>
          <h3 className="text-[13px] font-semibold text-amber-100">{step.title}</h3>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-300">{step.detail}</p>
          <div className="mt-2 border-t border-white/5 pt-2 font-mono text-[10.5px] text-slate-400">{step.metric}</div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-200 to-amber-500" style={{ width: `${flags.progress * 100}%` }} />
          </div>
        </Panel>
      </div>

      {/* 外部总览：点击金字塔进入内部的提示 */}
      {isExterior && (
        <div className="pointer-events-none absolute inset-x-0 bottom-44 z-20 flex justify-center sm:bottom-40">
          <button
            type="button"
            onClick={() => enterInterior(0)}
            className="pointer-events-auto group flex items-center gap-2.5 rounded-full border border-amber-300/40 bg-[#0d1117]/80 py-2 pr-4 pl-2.5 text-xs text-amber-100 shadow-[0_10px_40px_-12px_rgba(0,0,0,.9)] backdrop-blur-md transition hover:border-amber-200 hover:bg-[#151b25]/90"
          >
            <span className="relative flex h-6 w-6 items-center justify-center">
              <span className="absolute h-5 w-5 animate-ping rounded-full bg-amber-300/40" />
              <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-b from-amber-200 to-amber-500 text-[13px] text-[#2b1d05]">
                ⛏
              </span>
            </span>
            <span className="font-medium">点击金字塔 · 进入内部</span>
            <span className="hidden text-[10.5px] text-slate-400 sm:inline">或按 Enter</span>
          </button>
        </div>
      )}

      {/* 底部：外部为建造动画时间轴，内部为漫游工具条 */}
      <div className="absolute bottom-0 left-0 z-30 w-full p-3 sm:p-4">
        <Panel className="p-3">
          {isInside ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-amber-300/15 px-2 py-1 text-[11px] text-amber-100">
                内部漫游 · 站点 {station + 1}/{STATIONS.length} · {STATIONS[station].short}
              </span>
              <span className="hidden text-[11px] text-slate-400 sm:inline">
                在墓室与通道内拖动旋转、滚轮缩放；站点表在左侧面板
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <Btn onClick={() => gotoStation(station - 1)}>← 上一站</Btn>
                <Btn onClick={() => gotoStation(station + 1)}>下一站 →</Btn>
                <Btn onClick={() => viewer.current?.resetCamera()}>⌖ 归位</Btn>
                <Btn variant="gold" onClick={() => exitInterior('solid')}>
                  ⤺ 退出 · 看外部建造动画
                </Btn>
              </div>
            </div>
          ) : (
          <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => patch({ playing: !flags.playing, progress: flags.progress >= 1 ? 0 : flags.progress })}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-amber-200 to-amber-500 text-lg text-[#2b1d05] shadow-lg shadow-amber-500/20"
            >
              {flags.playing ? '❚❚' : '▶'}
            </button>
            <div className="flex items-center gap-1.5">
              {[0.5, 1, 2, 4].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => patch({ speed: s })}
                  className={cn(
                    'rounded-md border px-2 py-1 font-mono text-[10.5px] transition',
                    flags.speed === s
                      ? 'border-amber-300/60 bg-amber-300/15 text-amber-100'
                      : 'border-white/10 text-slate-400 hover:text-slate-200',
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
            <IconToggle
              active={flags.autoCamera}
              onClick={() => patch({ autoCamera: !flags.autoCamera })}
              icon="🎥"
              label="自动运镜"
              title="按建造工序自动切换机位"
            />
            {flags.playing && flags.progress < 0.985 && flags.showLabels && !isInside && (
              <span className="hidden rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10.5px] text-slate-400 sm:inline">
                建造播放中 · 仅显示当前施工构件标签
              </span>
            )}
            <div className="ml-auto flex items-center gap-2 text-[10.5px] text-slate-400">
              <span className="hidden sm:inline">空格 播放/暂停 · ←→ 逐帧 · 1–5 视图 · R 复位</span>
              <span className="font-mono text-slate-200">{(flags.progress * 100).toFixed(0)}%　{(flags.progress * 24).toFixed(1)} s</span>
            </div>
          </div>

          {/* 小屏工序说明 */}
          <div className="mt-2 flex items-baseline gap-2 xl:hidden">
            <span className="shrink-0 rounded-md bg-amber-300/15 px-1.5 py-0.5 text-[10px] text-amber-100">
              {step.label}
            </span>
            <span className="truncate text-[11px] text-slate-300">{step.title}</span>
            <span className="ml-auto hidden truncate font-mono text-[10px] text-slate-500 sm:block">{step.metric}</span>
          </div>

          {/* 工序分段条 */}
          <div className="relative mt-3 h-9">
            <div
              className="absolute inset-0 top-2 h-5 cursor-pointer overflow-hidden rounded-full border border-white/10 bg-white/[0.03]"
              onPointerDown={(e) => {
                const el = e.currentTarget;
                const rect = el.getBoundingClientRect();
                const move = (clientX: number) => {
                  const p = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
                  patch({ progress: p, playing: false });
                };
                move(e.clientX);
                const onMove = (ev: PointerEvent) => move(ev.clientX);
                const onUp = () => {
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                };
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
              }}
            >
              {STEPS.map((s, i) => (
                <div
                  key={s.id}
                  className="absolute top-0 flex h-full items-center justify-center border-r border-black/30 last:border-0"
                  style={{
                    left: `${s.from * 100}%`,
                    width: `${Math.max(0.5, (s.to - s.from) * 100)}%`,
                    background:
                      s.id === step.id
                        ? 'linear-gradient(180deg,rgba(252,211,77,.55),rgba(245,158,11,.35))'
                        : i % 2
                          ? 'rgba(255,255,255,.045)'
                          : 'rgba(255,255,255,.02)',
                  }}
                >
                  <span className="hidden truncate px-1 text-[9px] text-slate-300/90 lg:block">{i + 1}</span>
                </div>
              ))}
            </div>
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-amber-200 shadow-[0_0_10px_rgba(252,211,77,.9)]"
              style={{ left: `${flags.progress * 100}%` }}
            />
            <div
              className="pointer-events-none absolute -top-0.5 h-6 w-[3px] -translate-x-1/2 rounded-full bg-amber-200 shadow-[0_0_12px_rgba(252,211,77,1)]"
              style={{ left: `${flags.progress * 100}%` }}
            />
          </div>

          {/* 工序按钮 */}
          <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
            {STEPS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  patch({ progress: s.from + 0.002, playing: true, autoCamera: true });
                }}
                className={cn(
                  'shrink-0 rounded-md border px-2 py-1 text-[10.5px] whitespace-nowrap transition',
                  s.id === step.id
                    ? 'border-amber-300/60 bg-amber-300/15 text-amber-100'
                    : 'border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          </>
          )}
        </Panel>
      </div>

      {showExport && <BlenderExport onClose={() => setShowExport(false)} />}

      {/* 入场遮罩 */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[#070a11] transition-opacity duration-700',
          entered ? 'opacity-0' : 'opacity-100',
        )}
      >
        <div className="text-2xl">🔺</div>
        <p className="text-sm tracking-[0.3em] text-amber-200">KHUFU · 2560 B.C.</p>
        <p className="text-xs text-slate-400">
          正在构建 3D 场景：230 万块石材 / 60 层砌体 / 11 处内部结构
        </p>
        <p className="text-[11px] text-slate-500">点击金字塔即可进入内部，在真实尺度的通道与墓室中漫游</p>
      </div>
    </div>
  );
}
