/**
 * 胡夫金字塔 —— 测量基准数据 / 内部结构 / 建造流程
 * 坐标系：原点 = 底面中心，+Y 向上，北 = +Z，东 = +X，单位：米
 * 数据来源：Petrie (1883) 测绘、Lehner《The Complete Pyramids》、
 *          ScanPyramids（2017 μ子成像“大空腔”）、Nature 2016（王后墓室北侧走廊）
 */

export const DIMS = {
  baseSide: 230.33, // 底边边长 m
  height: 146.6, // 原高 m（现高约 137.5 m）
  halfBase: 115.165,
  slopeDeg: 51.844, // 51°50'40"
  slopeTan: 1.2728,
  courses: 210, // 原始砌石层数（约）
  blocks: 2300000, // 石材总数（约）
  avgBlockTons: 2.5,
  graniteTons: 80, // 花岗岩大梁最大单块重量
  volumeM3: 2590000,
  baseArea: 5.28, // 万 m²
  latitude: 29.9792,
  azimuthError: 0.067, // 四边方位误差（度）
  entranceHeight: 17.0,
  kcFloor: 43.0,
  qcFloor: 21.3,
};

export type Feature = {
  id: string;
  name: string;
  en: string;
  color: string;
  dims: string;
  desc: string;
  /** 标签锚点（米） */
  anchor: [number, number, number];
};

export const FEATURES: Feature[] = [
  {
    id: 'entrance',
    name: '入口与下降通道',
    en: 'Entrance & Descending Passage',
    color: '#f0a35e',
    dims: '原入口 1.04 × 1.17 m ｜ 坡度 26°31′23″ ｜ 斜长 105.2 m + 水平 8.84 m',
    desc: '原入口开在北面距地约 17 m 处（真实位置在中轴线以东 7.29 m）。由此以 26°31′ 笔直下降 105 m，穿过石核进入基岩。约 820 年哈里发阿尔·马蒙另在北面 7 m 高处水平掘出 27 m 盗墓道，绕过花岗岩塞石进入，那条盗洞至今是游客入口。',
    anchor: [0, 14, 98],
  },
  {
    id: 'subterranean',
    name: '地下墓室（未完工）',
    en: 'Subterranean Chamber',
    color: '#b07bd6',
    dims: '14.1 m（东西）× 8.4 m（南北）× 高约 4 m ｜ 深约 −27 m',
    desc: '下降通道尽头经 8.84 m 水平甬道抵达，直接凿在基岩中，是“第一方案墓室”，地面留有未完工深坑，南墙还续凿了一段约 16 m 的死巷。大画廊底端西墙有一条曲折服务竖井（长约 57 m）在此附近接回下降通道。',
    anchor: [0, -31, -3],
  },
  {
    id: 'ascending',
    name: '上升通道',
    en: 'Ascending Passage',
    color: '#f2c14e',
    dims: '长 39.3 m ｜ 坡度 26°02′ ｜ 断面 1.04 × 1.17 m ｜ 3 块花岗岩塞石',
    desc: '在下降通道内约 28 m 处的顶板方孔折转向上，断面与下降通道相同，长 39.3 m 直达大画廊底端。下端原有 3 块各约 1.5 m 的花岗岩塞石封死，盗墓者只能从旁边较软的石灰岩绕过。',
    anchor: [0, 13, 68],
  },
  {
    id: 'gallery',
    name: '大画廊',
    en: 'Grand Gallery',
    color: '#ffd166',
    dims: '斜长 47.9 m ｜ 挑高 8.6 m ｜ 底宽 2.06 m、顶宽 1.04 m ｜ 坡度 26°02′',
    desc: '金字塔内部最震撼的空间：自 2.29 m 高度起两侧各有 7 层挑檐，每层向内收 7.6 cm，把顶盖收窄到 1.04 m。地面两侧是宽 51 cm 的抬升坡道、共 54 个插孔（每侧 27 个），中间 1.04 m 为中央坡道——推测用于存放沿坡道滑下的封门巨石。',
    anchor: [0, 33, 20],
  },
  {
    id: 'queens',
    name: '王后墓室',
    en: "Queen's Chamber",
    color: '#5bc0a3',
    dims: '5.23 m（东西）× 5.75 m（南北）｜ 尖顶高约 6.3 m ｜ 位于南北正中',
    desc: '正好位于金字塔南、北两面正中（南北轴中点），地面 21.3 m，经约 38 m 水平通道自大画廊底端到达。屋顶是人字梁尖顶，东墙有高 4.67 m 的塞勒达特凹龛；南北两墙的“通风井”先水平 2 m 再斜上，末端被“吊门”石板封住，并未穿出塔外。',
    anchor: [0, 25, 0],
  },
  {
    id: 'north-corridor',
    name: '北侧隐藏走廊（2016）',
    en: 'Hidden North Corridor',
    color: '#9be566',
    dims: '长约 9 m ｜ 断面约 1.5 m',
    desc: '由 μ 子成像（ScanPyramids / Nature 2016）在王后墓室北侧人字梁后方发现，与石砌体呈一定倾角，功能仍无定论。',
    anchor: [1, 30, 8],
  },
  {
    id: 'kings',
    name: '国王墓室',
    en: "King's Chamber",
    color: '#e0574f',
    dims: '10.47 m（东西长轴）× 5.23 m（南北）× 高 5.84 m ｜ 地面距基面 43 m',
    desc: '经大画廊顶端台阶、闸门前厅（3 道花岗岩吊闸）和平顶短甬道进入。整室全由阿斯旺红花岗岩砌面，平顶由 9 块总重约 400 t 的花岗岩板构成；西端是无盖花岗岩石棺（外尺寸 2.28 × 0.98 × 1.05 m）。南北两墙距地 0.91 m 处各开一条斜井直通塔外。',
    anchor: [0, 46, -8],
  },
  {
    id: 'relieving',
    name: '减压室（5 层）+ 人字梁',
    en: 'Relieving Chambers & Gable Roof',
    color: '#f08a7a',
    dims: '5 个空腔 ｜ 空腔高约 1 m ｜ 花岗岩大梁单块重 50–80 t',
    desc: '国王墓室平顶（约在 48.8 m 高）以上叠了 4 层花岗岩大梁、围成 5 个空腔（自下而上：戴维森室、威灵顿室、纳尔逊室、阿巴思诺特室、坎贝尔室），把上方荷载分流到两侧砌体；最顶再以棱沿东西向的人字梁封顶。戴维森室由维西（Vyse）1837 年用火药炸开发现。',
    anchor: [0, 54, -8],
  },
  {
    id: 'shafts',
    name: '国王墓室通风井',
    en: 'Air Shafts',
    color: '#7fb2e5',
    dims: '北井 31° ／ 南井 45° ｜ 北井出口约在 80 m 高处',
    desc: '断面仅约 18–21 × 14 cm 的方形窄井，先水平穿过花岗岩墙体再斜向上升：国王墓室北井约 31°、南井约 45°，直达外立面；王后墓室两口井则是末端封死的盲管。1993 年 Upuaut、2002 年 Pyramid Rover、2011 年 Djedi 机器人先后发现“铜钩把手”与“分隔石门”。',
    anchor: [2, 66, 30],
  },
  {
    id: 'big-void',
    name: '“大空腔”（2017）',
    en: 'The Big Void',
    color: '#cfd8e3',
    dims: '长约 30 m ｜ 与大画廊同坡度 ｜ 体积近似整座大画廊',
    desc: 'ScanPyramids 用三种 μ 子探测器在大画廊正上方确认的未知空腔，长度至少 30 m、与大画廊同坡度。是否走廊、卸荷室或工人日记中记载的“花岗岩洞室”，尚无定论——金字塔仍在改写我们的认知。',
    anchor: [0, 44, 17],
  },
  {
    id: 'boat',
    name: '太阳船坑（东侧）',
    en: 'Solar Boat Pits',
    color: '#c8a25a',
    dims: '长 43 m × 宽 6 m ｜ 深约 3 m ｜ 41 块石灰岩封石',
    desc: '东侧地面上的两处船坑。1954 年考古队挖出完整的胡夫木质太阳船（长 43.6 m，1224 块木构件），1992 年发现第二艘。船体面向东方，象征法老随太阳神同船巡行天际。',
    anchor: [150, 2, 4],
  },
];

export type Step = {
  id: string;
  label: string;
  from: number;
  to: number;
  title: string;
  detail: string;
  metric: string;
  /** 自动运镜关键帧 */
  cam: { az: number; el: number; dist: number; target: [number, number, number] };
};

export const STEPS: Step[] = [
  {
    id: 'survey',
    label: '① 划线定基',
    from: 0.0,
    to: 0.07,
    title: '基岩平台与四面定向',
    detail:
      '先在吉萨高原的基岩上凿出水平平台，把水平度控制在 ±2 cm 内；再用“星位法”定出四面朝向——现代测绘显示平均方位误差仅 3′6″（0.067°），几乎精确对准正北。',
    metric: '底边 230.33 m ｜ 水平误差 < 2 cm ｜ 方位误差 3′',
    cam: { az: 38, el: 40, dist: 38, target: [0, 6, 0] },
  },
  {
    id: 'course-1',
    label: '② 第一层基石',
    from: 0.05,
    to: 0.16,
    title: '底层大块基石与转角咬合',
    detail:
      '底层石料取自本地图拉/吉萨石灰岩采石场，单块重约 2.5 t。转角处使用特制的“互锁”石块，让四角彼此咬合，抵抗基础不均匀沉降。',
    metric: '单块约 2.5 t ｜ 底层块长 1.5–2.5 m',
    cam: { az: 62, el: 14, dist: 29, target: [0, 3, 0] },
  },
  {
    id: 'core',
    label: '③ 阶梯石核',
    from: 0.10,
    to: 0.52,
    title: '粗石砌体内收，坡度恒定',
    detail:
      '金字塔的“芯”是一层层内收的粗石砌体（今天可见的阶梯状外观）。每层比下层内缩约 0.6–0.7 m，累积出 51°50′ 的恒定坡度；工人用斜坡道把石料送到作业面。',
    metric: '约 230 万块石材 ｜ 总重约 600 万吨 ｜ 层高 0.6–1.5 m',
    cam: { az: 26, el: 20, dist: 36, target: [0, 9, 0] },
  },
  {
    id: 'subterranean',
    label: '④ 地下通道',
    from: 0.16,
    to: 0.30,
    title: '开凿下降通道与地下墓室',
    detail:
      '主体上行之前，先自北面 17 m 高处向内开凿 26°34′ 的下降通道，直插基岩以下 30 m 的“地下墓室”——一座最终被放弃的、未经修整的粗凿空间。',
    metric: '下降通道 105 m ｜ 地下墓室 −30 m ｜ 断面 1.05 m',
    cam: { az: 88, el: 24, dist: 34, target: [0, -4, 18] },
  },
  {
    id: 'ascending',
    label: '⑤ 上升通道',
    from: 0.30,
    to: 0.42,
    title: '上升通道与王后墓室',
    detail:
      '在下降通道内折转向上，凿出 26°02′ 的上升通道；底端预留三块花岗岩塞石，一旦封门便无法从下方通过。上升通道底端向西南引出 47 m 水平通道，通抵王后墓室。',
    metric: '上升通道 39.3 m ｜ 塞石 3 块 ｜ 水平通道 47 m',
    cam: { az: 120, el: 30, dist: 32, target: [0, 14, 36] },
  },
  {
    id: 'gallery',
    label: '⑥ 大画廊',
    from: 0.42,
    to: 0.56,
    title: '大画廊：47.9 m 的重叠拱',
    detail:
      '石核砌至 25 m 高度时，需在内部留出长 47.9 m、高 8.6 m 的大画廊。两侧墙面由 7 层挑出的砌块向上收进，顶部 40 块巨石构成阶梯穹顶——这是人类最早的“叠涩拱”型空间之一。',
    metric: '长 47.9 m ｜ 高 8.6 m ｜ 顶部 40 块巨石',
    cam: { az: 150, el: 26, dist: 33, target: [0, 30, 28] },
  },
  {
    id: 'kings',
    label: '⑦ 国王墓室',
    from: 0.56,
    to: 0.70,
    title: '花岗岩墓室与减压室吊装',
    detail:
      '在 43 m 高度上，用阿斯旺红花岗岩砌出 10.47 × 5.23 m 的国王墓室。上方再叠 4 层大梁与 5 个空腔，最顶以 40 对石块搭成的人字梁把数百万吨荷载分流到两侧砌体。',
    metric: '花岗岩大梁单块 50–80 t ｜ 减压室 5 层',
    cam: { az: 196, el: 18, dist: 33, target: [0, 47, -5] },
  },
  {
    id: 'shafts',
    label: '⑧ 通风井',
    from: 0.66,
    to: 0.78,
    title: '两条直通星空的窄井',
    detail:
      '国王墓室南北两壁各开一条 20 × 22 cm 的方形斜井，分别以 31° 与 45° 穿过整片砌体抵达外立面。施工时石块上预先凿出的凹槽层层对齐，形成完全的直线。',
    metric: '北井 31° ｜ 南井 45° ｜ 出口高约 80 m / 94 m',
    cam: { az: 232, el: 34, dist: 37, target: [0, 60, 8] },
  },
  {
    id: 'casing',
    label: '⑨ 白色外壳',
    from: 0.70,
    to: 0.92,
    title: '图拉石灰岩外壳，自上而下倒铺',
    detail:
      '石核完成后，自顶石一侧开始向下铺设打磨光滑的图拉石灰岩外壳（Tura Casing）：每块外露面都经过研磨、四角微外凸以获得光学平整度。阿拉伯史家描述它像“一面巨大的镜子”。',
    metric: '外壳石约 8 万块 ｜ 白灰岩取自尼罗河东岸图拉',
    cam: { az: 300, el: 16, dist: 39, target: [0, 62, 0] },
  },
  {
    id: 'pyramidion',
    label: '⑩ 顶石就位',
    from: 0.92,
    to: 0.96,
    title: '顶石（Pyramidion）与星空指向',
    detail:
      '顶部冠以顶石，传统记载为金字塔形石块（有电石质、玄武岩或镀金木等多种说法），是“奔奔石 Benben”的象征。金字塔四棱的开口曾分别指向猎户座与北极星的天极。',
    metric: '顶石高度约 1.5 m ｜ 棱向误差 < 0.05°',
    cam: { az: 344, el: 28, dist: 35, target: [0, 95, 0] },
  },
  {
    id: 'finish',
    label: '⑪ 拆坡清场',
    from: 0.96,
    to: 1.0,
    title: '拆去坡道，封闭入口',
    detail:
      '清理斜面工栈与砂石坡道，拆去施工道路，把下降通道底的塞石封上——金字塔最终以“无门之墓”的姿态封闭，成为人类历史上第一座真正意义上的超级工程。',
    metric: '工期 20–27 年 ｜ 劳动力约 2–4 万人（轮作季节工）',
    cam: { az: 384, el: 20, dist: 41, target: [0, 60, 0] },
  },
];

/** 时间轴进度 → 当前工序（取 from 最大者，允许交叉） */
export function activeStep(p: number): Step {
  let best = STEPS[0];
  for (const s of STEPS) {
    if (p >= s.from && p <= s.to && s.from >= best.from) best = s;
  }
  return best;
}

export const VIEW_MODES = [
  { id: 'solid', label: '完整外观', hint: '落成原貌：白色外壳 + 镀金顶石（点击金字塔进入内部）' },
  { id: 'inside', label: '内部漫游', hint: '进入金字塔内部，按站点巡检真实空间' },
  { id: 'translucent', label: '透视外壳', hint: '外壳半透明，内部结构一览无余' },
  { id: 'cut', label: '四分之一剖切', hint: '切去东北象限，观看石核与内部空间关系' },
  { id: 'interior', label: '仅内部结构', hint: '外墙完全隐藏的“解剖图”' },
  { id: 'today', label: '今日现状', hint: '外壳剥落、顶石缺失的现代外观' },
] as const;

export type ViewModeId = (typeof VIEW_MODES)[number]['id'];

/** 内部漫游站点：pos = 相机机位，target = 看向的点（均为实体米坐标） */
export type Station = {
  id: string;
  name: string;
  short: string;
  pos: [number, number, number];
  target: [number, number, number];
  desc: string;
};

export const STATIONS: Station[] = [
  {
    id: 'entrance',
    name: '入口 · 北面距地 17 m',
    short: '入口',
    pos: [5, 19, 112],
    target: [0, 16, 99],
    desc: '原入口开在北面第 19 层砌石、距地约 17 m 处（真实位置在中轴线以东 7.29 m），上方有双人字梁过梁。内侧即 26°31′ 的下降通道；下方约 7 m 高处是 820 年阿尔·马蒙水平掘出的盗墓道，至今仍是游客入口。',
  },
  {
    id: 'descending',
    name: '下降通道（26°31′）',
    short: '下降通道',
    pos: [0.5, 4.4, 75],
    target: [0, -16, 34],
    desc: '断面 1.04 × 1.17 m 的窄廊以 26°31′23″ 笔直下降 105 m，穿过石核进入基岩。下行约 28 m 处顶板有方孔，即被三块花岗岩塞石封死的上升通道起点。',
  },
  {
    id: 'subterranean',
    name: '地下墓室（未完工）',
    short: '地下墓室',
    pos: [5, -30.5, 2],
    target: [-4, -32, -6],
    desc: '经下降通道尽头 8.84 m 的水平甬道抵达，凿于基面以下约 27 m 的基岩中，平面约 14.1 m（东西）× 8.4 m（南北）。地面有未完工深坑，南墙还续凿了一段约 16 m 死巷，是被中途放弃的“第一方案墓室”。',
  },
  {
    id: 'ascending',
    name: '上升通道',
    short: '上升通道',
    pos: [0.5, 8.8, 70.5],
    target: [0, 19, 48],
    desc: '从下降通道顶板方孔折向上升，断面 1.04 × 1.17 m、坡度 26°02′、长 39.3 m，直通大画廊底端。下端 3 块各约 1.5 m 的花岗岩塞石一旦滑入即彻底封死。',
  },
  {
    id: 'gallery',
    name: '大画廊（高 8.6 m）',
    short: '大画廊',
    pos: [0.85, 24.5, 40],
    target: [0, 40, 4],
    desc: '金字塔内部最震撼的空间：斜长 47.9 m、挑高 8.6 m，自 2.29 m 起两侧各 7 层挑檐向内收进 7.6 cm，把顶盖收窄到 1.04 m；地面两侧是带 27 对插孔的抬升坡道。底端向水平通道可去王后墓室，顶端经前厅去国王墓室。',
  },
  {
    id: 'queens',
    name: '王后墓室',
    short: '王后墓室',
    pos: [1.9, 25, 5],
    target: [-1.5, 25, -1],
    desc: '自大画廊底端经约 38 m 水平通道（末端经一级台阶加高到 1.68 m）抵达，墓室正好在金字塔南、北面正中。屋顶是人字梁尖顶，东墙有高 4.67 m 的凹龛；南北两墙各有先水平、后斜上的盲井，末端被石门封住。',
  },
  {
    id: 'kings',
    name: '国王墓室（花岗岩）',
    short: '国王墓室',
    pos: [3.4, 46.2, -8],
    target: [-3.5, 46, -8],
    desc: '经闸门前厅（3 道花岗岩吊闸）和平顶短甬道进入。10.47 m（东西）× 5.23 m × 高 5.84 m，地面距基面 43 m，整室以阿斯旺红花岗岩砌面，平顶由 9 块约 400 t 的石板构成；西端是无盖花岗岩石棺。',
  },
  {
    id: 'relieving',
    name: '减压室层（5 层空腔）',
    short: '减压室',
    pos: [3, 54, -5],
    target: [0, 55, -10],
    desc: '国王墓室平顶（约 48.8 m 高）以上叠了 4 层花岗岩大梁、围成 5 个空腔（戴维森室、威灵顿室、纳尔逊室、阿巴思诺特室、坎贝尔室），再以棱沿东西向的人字梁封顶，把上方荷载分流到两侧砌体。',
  },
  {
    id: 'big-void',
    name: '“大空腔”（2017 发现）',
    short: '大空腔',
    pos: [2, 40, 26],
    target: [0, 48, 6],
    desc: 'ScanPyramids 用三种 μ 子探测器在大画廊正上方确认的未知空腔，长约 30 m、与大画廊同坡度。它究竟是走廊、卸荷室还是未被记载的工事，仍是金字塔最大的悬案之一。',
  },
  {
    id: 'shaft',
    name: '国王墓室北通风井（31°）',
    short: '通风井',
    pos: [1.6, 60, 24],
    target: [2, 74, 44],
    desc: '自国王墓室北墙距地 0.91 m 处先水平穿出花岗岩墙、再以约 31° 斜升，断面仅约 20 × 20 cm，穿过 60 余米砌体直达外立面（南井约 45°）。Upuaut（1993）、Pyramid Rover（2002）、Djedi（2011）机器人先后在井内发现铜钩与“分隔石门”。',
  },
];
