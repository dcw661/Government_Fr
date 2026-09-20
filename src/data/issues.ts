export const statuses = ["待分配", "待处理", "处理中", "已完成"] as const;
export type Status = (typeof statuses)[number];
export interface Issue {
  id: string;
  title: string;
  submitter: string;
  submittedAt: string;
  longitude: number;
  latitude: number;
  images: string[];
  type: string;
  description: string;
  assignee: string;
  progress: Status;
  address: string;
  version: number;
}
export const people = [
  "王建国 · 市政养护",
  "李晓敏 · 环境卫生",
  "陈志远 · 绿化管理",
  "赵海波 · 城市管理",
];
export const types = [
  "道路设施",
  "环境卫生",
  "公共设施",
  "绿化养护",
  "市容秩序",
];
const rows: [string, string, string, Status, number, number, string][] = [
  [
    "人行道地砖破损，影响通行",
    "道路设施",
    "中山路与珠江路交叉口",
    "待分配",
    118.776,
    32.058,
    "人行道多处地砖松动、破损，雨天容易积水，附近行人较多，请安排人员检查并修复。",
  ],
  [
    "垃圾桶满溢，需及时清运",
    "环境卫生",
    "广州路社区服务中心附近",
    "处理中",
    118.763,
    32.056,
    "公共垃圾桶已满，周边散落生活垃圾，建议增派清运并清洁地面。",
  ],
  [
    "路灯损坏，夜间照明不足",
    "公共设施",
    "北京东路和平公园南门",
    "待处理",
    118.791,
    32.065,
    "连续两盏路灯无法正常亮起，影响夜间步行，请安排检修。",
  ],
  [
    "绿化树枝遮挡交通指示牌",
    "绿化养护",
    "中央路玄武门路口",
    "处理中",
    118.782,
    32.078,
    "道路旁树枝生长较密，遮挡部分交通指示牌，需进行修剪。",
  ],
  [
    "沿街商户占道堆放杂物",
    "市容秩序",
    "丹凤街北段",
    "待分配",
    118.783,
    32.059,
    "商户将纸箱和杂物堆放在人行道，通行空间较窄，请核查处理。",
  ],
  [
    "公园休息座椅损坏",
    "公共设施",
    "北极阁市民广场",
    "已完成",
    118.793,
    32.073,
    "广场休息座椅木板断裂，目前已更换损坏部件并完成现场检查。",
  ],
  [
    "雨水井盖周边路面沉降",
    "道路设施",
    "上海路宁海路段",
    "待处理",
    118.754,
    32.062,
    "井盖周边出现路面沉降，经过车辆有明显颠簸，建议检查修复。",
  ],
  [
    "河道岸边发现散落垃圾",
    "环境卫生",
    "金川河步行道",
    "已完成",
    118.76,
    32.079,
    "步道旁有散落包装袋和饮料瓶，环卫人员已完成清理。",
  ],
  [
    "行道树支撑架松动",
    "绿化养护",
    "太平北路沿线",
    "待分配",
    118.803,
    32.058,
    "新栽行道树支撑架连接处松动，需加固以防大风天气倾倒。",
  ],
  [
    "非机动车停放阻碍通行",
    "市容秩序",
    "新街口地铁站北出口",
    "处理中",
    118.783,
    32.043,
    "出口附近非机动车停放较集中，占用部分通道，建议疏导整理。",
  ],
  [
    "公交站台导向牌松脱",
    "公共设施",
    "汉中路公交站",
    "已完成",
    118.765,
    32.041,
    "站台导向牌固定螺丝松动，已重新加固。",
  ],
  [
    "道路隔离护栏破损",
    "道路设施",
    "长江路文化街区",
    "待处理",
    118.801,
    32.049,
    "道路隔离护栏局部变形，存在尖锐边缘，需要更换损坏段。",
  ],
];
export const initialIssues: Issue[] = rows.map((r, i) => ({
  id: `CS20260918${String(i + 1).padStart(3, "0")}`,
  title: r[0],
  type: r[1],
  address: r[2],
  progress: r[3],
  longitude: r[4],
  latitude: r[5],
  description: r[6],
  submitter: ["张女士", "刘先生", "周女士", "吴先生"][i % 4]!,
  submittedAt: `2026-09-18 ${String(10 - Math.floor(i / 4)).padStart(2, "0")}:${String(48 - i * 3).padStart(2, "0")}`,
  assignee: r[3] === "待分配" ? "" : people[i % 4]!,
  images: ["/issue-scene.svg"],
  version: 0,
}));
export function isIssueList(value: unknown): value is Issue[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (v) =>
        v &&
        [
          "id",
          "title",
          "submitter",
          "submittedAt",
          "type",
          "description",
          "assignee",
          "address",
        ].every((k) => typeof v[k] === "string") &&
        Number.isFinite(v.longitude) &&
        Number.isFinite(v.latitude) &&
        Math.abs(v.longitude) <= 180 &&
        Math.abs(v.latitude) <= 90 &&
        Array.isArray(v.images) &&
        v.images.every((x: unknown) => typeof x === "string") &&
        statuses.includes(v.progress),
    ) &&
    new Set(value.map((v) => v.id)).size === value.length
  );
}
