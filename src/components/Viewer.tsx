import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { KhufuViewer, type ViewerFlags } from '../scene/khufu';

export type ViewerHandle = {
  seek: (progress: number) => void;
  focusFeature: (id: string) => void;
  focusConstructionSite: () => void;
  resetCamera: () => void;
  screenshot: () => void;
  loadGLB: (file: File) => Promise<{ duration: number; clips: string[] }>;
  clearGLB: () => void;
  cameraPreset: (az: number, el: number, dist: number, y: number) => void;
  enterInterior: (station?: number) => void;
  exitInterior: () => void;
  gotoStation: (station: number) => void;
};

type Props = {
  flags: Omit<ViewerFlags, 'progress' | 'playing'> & { progress: number; playing: boolean };
  onProgress: (p: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onUserInteract: () => void;
  onEnter: () => void;
};

const Viewer = forwardRef<ViewerHandle, Props>(function Viewer(
  { flags, onProgress, onPlayingChange, onUserInteract, onEnter },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<KhufuViewer | null>(null);
  const cbRef = useRef({ onProgress, onPlayingChange, onUserInteract, onEnter });
  cbRef.current = { onProgress, onPlayingChange, onUserInteract, onEnter };

  useEffect(() => {
    if (!canvasRef.current || viewerRef.current) return;
    const v = new KhufuViewer(canvasRef.current, (p) => cbRef.current.onProgress(p));
    viewerRef.current = v;
    v.onPlayingChange = (playing) => cbRef.current.onPlayingChange(playing);
    v.onCameraControl = () => cbRef.current.onUserInteract();
    v.onEnterRequest = () => cbRef.current.onEnter();
    if (hostRef.current) v.attachLabels(hostRef.current);
    v.setFlags(flags);
    v.setProgress(flags.progress);
    const ro = new ResizeObserver(() => v.resize());
    if (canvasRef.current.parentElement) ro.observe(canvasRef.current.parentElement);
    // 只有当用户真正“拖动/滚轮改变机位”时才取消自动运镜；
    // 单纯点击塔身（进入内部）不会取消它，保证默认勾选的“自动运镜”不被清掉
    let dragging = false;
    const onDown = () => {
      dragging = true;
    };
    const onUp = () => {
      dragging = false;
    };
    const onMove = () => {
      if (dragging) cbRef.current.onUserInteract();
    };
    const onWheel = () => cbRef.current.onUserInteract();
    canvasRef.current.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    canvasRef.current.addEventListener('pointermove', onMove);
    canvasRef.current.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      ro.disconnect();
      canvasRef.current?.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      canvasRef.current?.removeEventListener('pointermove', onMove);
      canvasRef.current?.removeEventListener('wheel', onWheel);
      v.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevFlags = useRef(flags);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    const prev = prevFlags.current;
    prevFlags.current = flags;
    // 播放中进度由 3D 循环推进，避免每帧 setFlags → 触发 React 全树对照
    const settingsUnchanged =
      flags.mode === prev.mode &&
      flags.speed === prev.speed &&
      flags.autoCamera === prev.autoCamera &&
      flags.autoRotate === prev.autoRotate &&
      flags.wireframe === prev.wireframe &&
      flags.showLabels === prev.showLabels &&
      flags.showEdges === prev.showEdges &&
      flags.rayTracing === prev.rayTracing &&
      flags.renderQuality === prev.renderQuality &&
      flags.playing === prev.playing;
    // 进度回报只更新界面；用户跳转通过 seek 单独送入场景，避免旧进度回写。
    if (!settingsUnchanged) v.setFlags(flags);
    if (flags.playing !== prev.playing || flags.speed !== prev.speed) {
      v.setPlaying(flags.playing, flags.speed);
    }
  }, [flags]);

  useImperativeHandle(ref, () => ({
    seek: (progress) => viewerRef.current?.setProgress(progress),
    focusFeature: (id) => viewerRef.current?.focusFeature(id),
    focusConstructionSite: () => viewerRef.current?.focusConstructionSite(),
    resetCamera: () => viewerRef.current?.resetCamera(),
    screenshot: () => {
      const v = viewerRef.current;
      if (!v) return;
      const a = document.createElement('a');
      a.href = v.screenshot();
      a.download = `khufu-pyramid-${Date.now()}.png`;
      a.click();
    },
    loadGLB: async (file) => (await viewerRef.current!.loadGLB(file)) ?? { duration: 0, clips: [] },
    clearGLB: () => viewerRef.current?.clearGLB(),
    cameraPreset: (az, el, dist, y) => viewerRef.current?.cameraPreset(az, el, dist, y),
    enterInterior: (station = 0) => viewerRef.current?.enterInterior(station),
    exitInterior: () => viewerRef.current?.exitInterior(),
    gotoStation: (station) => viewerRef.current?.gotoStation(station),
  }));

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />
      <div
        ref={hostRef}
        className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
        style={{ transition: 'opacity .3s' }}
      />
    </div>
  );
});

export default Viewer;
