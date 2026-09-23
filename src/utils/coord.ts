/**
 * 坐标系转换工具。
 *
 * 百度地图底图使用 BD-09；国内大多数上报端 / 第三方 POI 数据使用 GCJ-02（高德、腾讯等），
 * GPS 设备原始输出为 WGS-84。把 GCJ-02 坐标直接画到百度底图上会有约 500 米的系统性偏移，
 * 所以叠加点位前必须先转换。
 *
 * 接入真实后端时，请把 SOURCE_COORD_SYSTEM 改成后端实际返回的坐标系。
 */

/** 上报数据使用的坐标系 */
export type CoordSystem = "gcj02" | "wgs84" | "bd09";

// 当前上报端使用原生 GPS／浏览器定位，后端原样保存 WGS-84。
export const SOURCE_COORD_SYSTEM: CoordSystem = "wgs84";

const PI = Math.PI;
const X_PI = (PI * 3000) / 180;
/** 克拉索夫斯基椭球长半轴（米） */
const EARTH_A = 6378245.0;
/** 第一偏心率平方 */
const EARTH_EE = 0.00669342162296594323;

function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret =
    -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  ret += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3;
  ret += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret =
    300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  ret += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3;
  ret += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3;
  return ret;
}

/** WGS-84 → GCJ-02 */
export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) return [lng, lat];
  let dLat = transformLat(lng - 105, lat - 35);
  let dLng = transformLng(lng - 105, lat - 35);
  const radLat = (lat / 180) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EARTH_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((EARTH_A * (1 - EARTH_EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180) / ((EARTH_A / sqrtMagic) * Math.cos(radLat) * PI);
  return [lng + dLng, lat + dLat];
}

/** GCJ-02 → BD-09 */
export function gcj02ToBd09(lng: number, lat: number): [number, number] {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * X_PI);
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * X_PI);
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
}

/** 按 SOURCE_COORD_SYSTEM 声明的坐标系转换成百度底图可用的 BD-09 */
export function toBd09(
  lng: number,
  lat: number,
  coordSystem: CoordSystem = SOURCE_COORD_SYSTEM,
): [number, number] {
  if (coordSystem === "bd09") return [lng, lat];
  const source: [number, number] =
    coordSystem === "wgs84" ? wgs84ToGcj02(lng, lat) : [lng, lat];
  return gcj02ToBd09(source[0], source[1]);
}
