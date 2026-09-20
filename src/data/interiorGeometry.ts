/**
 * 胡夫金字塔内部结构 —— 几何连接表
 * 坐标系：米制，原点 = 底面中心，Y 轴向上，+Z = 北
 *
 * 连通关系（一条连续通道贯穿所有内部空间）：
 *
 *   [入口凿口]  (7.3, 17, 101.8)  ← 北面外壳表面
 *       ↓ 下降通道 26°34′
 *   [上升通道分叉] (−1.1, 6.5, 79.2)
 *       ↘ 下降通道继续 → 地下墓室
 *       ↗ 上升通道 26°02′ → 大画廊底端
 *   [大画廊底端] (0, 25.85, 63)
 *       ↓ 大画廊 26°02′ 向上
 *       └→ 向西分支：水平通道 → 王后墓室
 *   [大画廊顶端] (0, 46.9, 20)
 *       ↓ 前厅 → 国王墓室走廊 → 国王墓室
 *       ↓ 头顶：5 层减压室 + 人字梁
 *   [国王墓室] 中心 (0, 49.82, -8)
 *       ↓ 南北两侧：4 条通风井穿墙出塔
 */

// 入口与下降段
export const ENTRANCE = {
  // 入口开凿口：嵌入北面外壳的一个凹龛
  opening: { pos: [7.3, 17, 101.8] as [number, number, number], size: [1.7, 2.3, 1.2] as [number, number, number] },
  // 下降通道：从入口内口 → 地下墓室
  descent: { a: [0, 17, 99], b: [0, -30, 5.6] },
};

// 上升段（从下降通道内分叉）
export const ASCENDING = {
  // 分叉点：距下降通道入口约 28 m
  split: [0.5, 8.55, 78.5] as [number, number, number],
  // 上升通道：从分叉点 → 大画廊底端
  corridor: { a: [0.5, 8.55, 78.5], b: [0, 25.85, 63] },
  // 塞石（3 块花岗岩）
  plugs: [
    [0.3, 9.3, 76.2],
    [0.3, 10.5, 73.4],
    [0.3, 11.7, 70.6],
  ] as [number, number, number][],
};

// 大画廊（从上升通道顶端开始，26°02′ 向上，长 47.9 m，挑高 8.6 m）
export const GALLERY = {
  bottom: [0, 25.85, 63] as [number, number, number],
  top: [0, 46.9, 20] as [number, number, number],
  // 7 层叠涩挑檐
  corbels: 7,
  // 地面坡道（两侧有 27 对插孔）
  rampSlots: 27,
};

// 王后墓室（从大画廊底端向西 47 m）
export const QUEENS = {
  // 水平通道：大画廊底端 → 王后墓室东墙
  corridor: { a: [0, 25.85, 63], b: [0, 25.85, 28] },
  // 墓室：中心 (0, 28.9, 25)
  chamber: { pos: [0, 28.9, 25] as [number, number, number], size: [5.23, 6.2, 5.74] as [number, number, number] },
  // 人字梁屋顶顶点
  gablePeak: [0, 33.5, 25] as [number, number, number],
  // 东墙凹龛
  niche: { pos: [0, 29.2, 27.8] as [number, number, number], size: [0.9, 4.7, 0.4] as [number, number, number] },
  // 王后北通风井（未穿透外壳的盲管）
  shaftN: { a: [1.5, 30.5, 27.9], b: [1.5, 60.8, 67.4] },
  shaftS: { a: [-1.5, 30.5, 22.1], b: [-1.5, 87.2, -46.7] },
};

// 国王墓室（从大画廊顶端 → 前厅 → 走廊 → 墓室）
export const KINGS = {
  // 前厅：大画廊顶端 → 走廊入口
  ante: { a: [0, 46.9, 20], b: [0, 46.9, 15] },
  // 走廊（Portcullis，闸门室）：水平 8 m 后下降到国王墓室地面
  corridor: { a: [0, 46.9, 15], b: [0, 43.0, -2.7] },
  // 墓室：中心 (0, 49.82, -8)，长轴东西向
  chamber: { pos: [0, 49.82, -8] as [number, number, number], size: [5.23, 5.84, 10.47] as [number, number, number] },
  // 花岗岩石棺：在西端
  sarcophagus: { pos: [-1.8, 47.6, -8] as [number, number, number], size: [1.0, 1.05, 2.3] as [number, number, number] },
  // 南北通风井开口（穿墙到塔外）
  shaftN: { a: [1.8, 50.6, -2.7], b: [1.8, 82.8, 50.4] },
  shaftS: { a: [-1.8, 50.6, -13.2], b: [-1.8, 85.4, -48] },
};

// 减压室（国王墓室上方的 5 个空腔）
export const RELIEVING = {
  // 从国王墓室顶面 (y = 52.74) 开始，每层高 1.5 m
  startY: 52.74,
  layerHeight: 1.5,
  count: 5,
  // 每层空腔
  cavity: { size: [5.23, 1.0, 10.47] as [number, number, number], z: -8 },
  // 每层大梁
  beam: { size: [5.7, 0.5, 10.8] as [number, number, number], z: -8 },
  // 顶层人字梁
  gableY: 60.8,
  gableWidth: 5.6,
};

// 地下墓室（−30 m 基岩中）
export const SUBTERRANEAN = {
  // 从下降通道底端 (0, -30, 5.6) 继续向前约 10 m 到达地下墓室
  passage: { a: [0, -30, 5.6], b: [0, -30, -5] },
  // 墓室：中心 (0, -31.8, -5)，27 × 8 m
  chamber: { pos: [0, -31.8, -5] as [number, number, number], size: [8, 3.6, 27] as [number, number, number] },
  // 未完工深坑
  pit: { pos: [3.2, -37, -8] as [number, number, number], size: [4, 6, 4] as [number, number, number] },
  // 通往大画廊底端的竖井
  shaft: { a: [5.8, -28, -10], b: [-1, 21.5, 55] },
};
