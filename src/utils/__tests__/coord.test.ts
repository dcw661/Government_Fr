/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { gcj02ToBd09, SOURCE_COORD_SYSTEM, toBd09, wgs84ToGcj02 } from "../coord.ts";

const gps: [number, number] = [118.921196, 32.082145];

function distanceMeters(a: [number, number], b: [number, number]): number {
  return Math.hypot(
    (a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180),
    a[1] - b[1],
  ) * 111320;
}

test("上报坐标默认按 WGS-84 完整转换，不再漏掉 GPS 转换步骤", () => {
  assert.equal(SOURCE_COORD_SYSTEM, "wgs84");
  const actual = toBd09(...gps);
  const expected = gcj02ToBd09(...wgs84ToGcj02(...gps));
  assert.deepEqual(actual, expected);
  assert.ok(Math.abs(actual[0] - 118.93265839414605) < 1e-10);
  assert.ok(Math.abs(actual[1] - 32.08627086538615) < 1e-10);
  assert.ok(distanceMeters(actual, gcj02ToBd09(...gps)) > 500);
});

test("地图初始参考点显式使用 GCJ-02，不受上报坐标系变化影响", () => {
  const center: [number, number] = [118.7835, 32.0575];
  assert.deepEqual(toBd09(...center, "gcj02"), gcj02ToBd09(...center));
});

test("已经是 BD-09 的坐标不重复转换或截断小数", () => {
  const point: [number, number] = [118.93265839414605, 32.08627086538615];
  assert.deepEqual(toBd09(...point, "bd09"), point);
});

test("JSON 数字保留七位小数，地图转换不修改原始坐标", () => {
  const original = { longitude: 118.9211967, latitude: 32.0821459 };
  const parsed = JSON.parse(JSON.stringify(original));
  assert.deepEqual(parsed, original);
  const converted = toBd09(parsed.longitude, parsed.latitude);
  assert.deepEqual(parsed, original);
  assert.notDeepEqual(converted, [parsed.longitude, parsed.latitude]);
  assert.notEqual(converted[0], Number(converted[0].toFixed(6)));
});

test("WGS-84 转 GCJ-02 在境外不叠加国内偏移", () => {
  assert.deepEqual(wgs84ToGcj02(-0.1278, 51.5074), [-0.1278, 51.5074]);
});
