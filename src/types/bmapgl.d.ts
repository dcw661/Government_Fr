/**
 * 百度地图 JS API（WebGL / BMapGL）最小类型声明。
 *
 * 官方 SDK 通过 index.html 的 <script> 标签以全局变量 window.BMapGL 注入，
 * 没有 npm 类型包，所以这里只声明本项目实际用到的能力。
 * 需要更多接口时，请对照官方文档 https://lbsyun.baidu.com/ 补充。
 */

export interface BMapGLSize {
  width: number;
  height: number;
}

export interface BMapGLPoint {
  lng: number;
  lat: number;
}

export interface BMapGLIcon {
  imageUrl: string;
}

export interface BMapGLMapOptions {
  minZoom?: number;
  maxZoom?: number;
}

export interface BMapGLMap {
  centerAndZoom(center: BMapGLPoint, zoom: number): void;
  setCenter(center: BMapGLPoint, options?: Record<string, unknown>): void;
  panTo(center: BMapGLPoint, options?: Record<string, unknown>): void;
  setZoom(zoom: number): void;
  getZoom(): number;
  zoomIn(): void;
  zoomOut(): void;
  enableScrollWheelZoom(enable?: boolean): void;
  setViewport(points: BMapGLPoint[], options?: Record<string, unknown>): void;
  addOverlay(overlay: BMapGLOverlay): void;
  removeOverlay(overlay: BMapGLOverlay): void;
  clearOverlays(): void;
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
  destroy?(): void;
}

export interface BMapGLOverlay {
  setIcon(icon: BMapGLIcon): void;
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
}

export type BMapGLMarker = BMapGLOverlay;

export interface BMapGLLabel extends BMapGLOverlay {
  setStyle?(style: Record<string, string>): void;
}

export interface BMapGLMarkerOptions {
  icon?: BMapGLIcon;
  offset?: BMapGLSize;
  enableMassClear?: boolean;
  rotation?: number;
}

export interface BMapGLIconOptions {
  anchor?: BMapGLSize;
  imageSize?: BMapGLSize;
}

export interface BMapGLLabelOptions {
  position?: BMapGLPoint;
  offset?: BMapGLSize;
  enableMassClear?: boolean;
}

export interface BMapGLNamespace {
  Map: new (
    container: string | HTMLElement,
    options?: BMapGLMapOptions,
  ) => BMapGLMap;
  Point: new (lng: number, lat: number) => BMapGLPoint;
  Size: new (width: number, height: number) => BMapGLSize;
  Icon: new (
    imageUrl: string,
    size: BMapGLSize,
    options?: BMapGLIconOptions,
  ) => BMapGLIcon;
  Marker: new (
    point: BMapGLPoint,
    options?: BMapGLMarkerOptions,
  ) => BMapGLMarker;
  Label?: new (
    content: string,
    options?: BMapGLLabelOptions,
  ) => BMapGLLabel;
}

declare global {
  interface Window {
    /** 由 index.html 中的百度地图 SDK 脚本注入，未配置/加载失败时为 undefined */
    BMapGL?: BMapGLNamespace;
  }
}
