'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildInequalityFaceFill } from './box_face_fill';
import { marchingCubes, type Bounds3 } from './marching_cubes';
import type { ClassifiedRow3d } from './model';
import { orbitToPosition, type OrbitState } from './orbit_camera';
import { buildSurfaceMesh } from './surface_mesh';
import type { Scope } from '../graphing_calculator/parser';

export interface RenderRow3d {
  id: string;
  raw: string;
  color: string;
  hidden: boolean;
  row: ClassifiedRow3d;
}

export interface GraphCanvas3dHandle {
  exportPng: (pixelScale: number) => void;
}

interface GraphCanvas3dProps {
  rows: RenderRow3d[];
  params: Scope;
  orbit: OrbitState;
  onOrbit: (dAzimuth: number, dElevation: number) => void;
  onPan: (dxScreen: number, dyScreen: number, viewHeightPx: number, fovRadians: number) => void;
  onDolly: (factor: number) => void;
  fileName: string;
  showGrid: boolean;
}

interface GraphTheme3d {
  background: string;
  gridLine: string;
  axisLine: string;
  labelText: string;
}

function readTheme3d(): GraphTheme3d {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    background: read('--background', '#ffffff'),
    gridLine: read('--border', '#e5e5e5'),
    axisLine: read('--muted-foreground', '#666666'),
    labelText: read('--muted-foreground', '#666666'),
  };
}

const BOX: Bounds3 = { min: -5, max: 5 };
const SURFACE_RESOLUTION = 72;
const IMPLICIT_RESOLUTION = 34;
const FACE_FILL_RESOLUTION = 48;
const FOV_DEGREES = 45;

const TICKS = [-4, -2, 2, 4];
interface LabelAnchor {
  position: [number, number, number];
  text: string;
  axis: boolean;
}
// The arrow cone tip sits at BOX.max + 0.6 (see buildBoxGrid's `axisLength`); axis name labels
// sit further out again so they never visually blend into the cone.
const AXIS_LABEL_DISTANCE = BOX.max + 1.35;
const LABEL_ANCHORS: LabelAnchor[] = [
  { position: [AXIS_LABEL_DISTANCE, 0, 0], text: 'x', axis: true },
  { position: [0, AXIS_LABEL_DISTANCE, 0], text: 'y', axis: true },
  { position: [0, 0, AXIS_LABEL_DISTANCE], text: 'z', axis: true },
  ...TICKS.map((v): LabelAnchor => ({ position: [v, 0, 0], text: String(v), axis: false })),
  ...TICKS.map((v): LabelAnchor => ({ position: [0, v, 0], text: String(v), axis: false })),
  ...TICKS.map((v): LabelAnchor => ({ position: [0, 0, v], text: String(v), axis: false })),
];

function buildBoxGrid(theme: GraphTheme3d): THREE.Group {
  const group = new THREE.Group();
  const { min, max } = BOX;

  const edgePositions: number[] = [];
  const corners: [number, number, number][] = [
    [min, min, min], [max, min, min], [max, max, min], [min, max, min],
    [min, min, max], [max, min, max], [max, max, max], [min, max, max],
  ];
  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (const [a, b] of edges) {
    edgePositions.push(...(corners[a] as number[]), ...(corners[b] as number[]));
  }
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
  const edgeMaterial = new THREE.LineBasicMaterial({ color: theme.axisLine, transparent: true, opacity: 0.6 });
  group.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));

  // Minor grid lines on the 3 "back" faces only, matching the open-box look of the reference.
  const gridPositions: number[] = [];
  const step = 1;
  for (let v = min; v <= max; v += step) {
    // y = min floor
    gridPositions.push(min, min, v, max, min, v);
    gridPositions.push(v, min, min, v, min, max);
    // x = min wall
    gridPositions.push(min, min, v, min, max, v);
    gridPositions.push(min, v, min, min, v, max);
    // z = min wall
    gridPositions.push(min, v, min, max, v, min);
    gridPositions.push(v, min, min, v, max, min);
  }
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
  const gridMaterial = new THREE.LineBasicMaterial({ color: theme.gridLine, transparent: true, opacity: 0.5 });
  group.add(new THREE.LineSegments(gridGeometry, gridMaterial));

  // Axis lines with an arrowhead cone at the positive tip, matching Desmos 3D's look. Rendered
  // as thin cylinders rather than THREE.Line: WebGL ignores LineBasicMaterial.linewidth on most
  // platforms (a long standing ANGLE/GPU driver limitation), so a genuinely bold line needs mesh
  // geometry instead.
  const axisLength = max + 0.6;
  const axisMaterial = new THREE.MeshBasicMaterial({ color: theme.axisLine });
  const shaftGeometry = new THREE.CylinderGeometry(0.028, 0.028, axisLength, 12);
  shaftGeometry.translate(0, axisLength / 2, 0);
  const coneGeometry = new THREE.ConeGeometry(0.12, 0.34, 16);
  const directions: [number, number, number][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (const dir of directions) {
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dir[0], dir[1], dir[2]));

    const shaft = new THREE.Mesh(shaftGeometry, axisMaterial);
    shaft.quaternion.copy(quaternion);
    group.add(shaft);

    const cone = new THREE.Mesh(coneGeometry, axisMaterial);
    cone.position.set(dir[0] * axisLength, dir[1] * axisLength, dir[2] * axisLength);
    cone.quaternion.copy(quaternion);
    group.add(cone);
  }

  return group;
}

interface MeshCacheEntry {
  key: string;
  object: THREE.Object3D;
}

function bufferFrom(positions: Float32Array, normals: Float32Array): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
  });
}

export const GraphCanvas3d = forwardRef<GraphCanvas3dHandle, GraphCanvas3dProps>(function GraphCanvas3d(
  { rows, params, orbit, onOrbit, onPan, onDolly, fileName, showGrid },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelContainerRef = useRef<HTMLDivElement>(null);
  const hoverLabelRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 480 });

  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    rowsGroup: THREE.Group;
    boxGrid: THREE.Group;
  } | null>(null);
  const meshCache = useRef(new Map<string, MeshCacheEntry>());
  const orbitRef = useRef(orbit);
  const paramsRef = useRef(params);
  const labelElements = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    orbitRef.current = orbit;
  }, [orbit]);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  // One-time scene setup.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1, 0.1, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // The renderer only sets the canvas's drawing-buffer size, never its CSS size on its own;
    // without this the canvas displays at its raw buffer resolution (device pixels), overflowing
    // the container to the bottom right and getting blurrily rescaled by the browser.
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.append(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const directional = new THREE.DirectionalLight(0xffffff, 0.55);
    directional.position.set(8, 14, 10);
    scene.add(directional);

    const rowsGroup = new THREE.Group();
    scene.add(rowsGroup);
    const boxGrid = buildBoxGrid(readTheme3d());
    scene.add(boxGrid);

    three.current = { renderer, scene, camera, rowsGroup, boxGrid };

    let frame = 0;
    function tick() {
      const t = three.current;
      if (t) {
        const position = orbitToPosition(orbitRef.current);
        t.camera.position.set(position[0], position[1], position[2]);
        t.camera.lookAt(orbitRef.current.target[0], orbitRef.current.target[1], orbitRef.current.target[2]);
        t.renderer.render(t.scene, t.camera);
        updateLabelPositions(t.camera, labelElements.current, labelContainerRef.current);
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      disposeObject(rowsGroup);
      disposeObject(boxGrid);
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
    };
  }, []);

  // Resize handling.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.max(1, width), height: Math.max(1, height) });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const t = three.current;
    if (!t) return;
    t.renderer.setSize(size.width, size.height, false);
    t.camera.aspect = size.width / size.height;
    t.camera.updateProjectionMatrix();
  }, [size]);

  // Theme (light/dark) tracking. Unlike the 2D canvas (theme only ever feeds imperative
  // `ctx.fillStyle` calls, invisible to hydration), these labels put theme colour straight into
  // DOM `style` attributes, so the initial render must stay on the neutral fallback (matching
  // the server) and only pick up the real theme once mounted, or React flags a hydration
  // mismatch between the server's fallback and the client's immediately-read real theme.
  const [theme, setTheme] = useState<GraphTheme3d>({
    background: '#ffffff',
    gridLine: '#e5e5e5',
    axisLine: '#666666',
    labelText: '#666666',
  });
  useEffect(() => {
    setTheme(readTheme3d());
    const observer = new MutationObserver(() => setTheme(readTheme3d()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMediaChange = () => setTheme(readTheme3d());
    media.addEventListener('change', onMediaChange);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', onMediaChange);
    };
  }, []);

  useEffect(() => {
    const t = three.current;
    if (!t) return;
    t.scene.background = new THREE.Color(theme.background);
    t.scene.remove(t.boxGrid);
    disposeObject(t.boxGrid);
    const nextGrid = buildBoxGrid(theme);
    nextGrid.visible = showGrid;
    t.boxGrid = nextGrid;
    t.scene.add(nextGrid);
  }, [theme, showGrid]);

  // Rebuild every visible row's mesh whenever the model or theme changes. Implicit/inequality
  // rows are cached by a key of (raw text + the slider values they actually depend on) so an
  // unrelated animating slider never forces every implicit surface to re-march every frame.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const cache = meshCache.current;
    const seenIds = new Set<string>();
    const nextGroup = new THREE.Group();

    for (const entry of rows) {
      if (entry.hidden) continue;
      seenIds.add(entry.id);
      const { row, color } = entry;

      if (row.type === 'surface') {
        const { positions, normals } = buildSurfaceMesh(row.evaluate, row.axis, BOX, SURFACE_RESOLUTION, params);
        const geometry = bufferFrom(positions, normals);
        const material = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.color = color;
        nextGroup.add(mesh);
        continue;
      }

      if (row.type === 'point3') {
        if (![row.x, row.y, row.z].every(Number.isFinite)) continue;
        const geometry = new THREE.SphereGeometry(0.09, 20, 16);
        const material = new THREE.MeshStandardMaterial({ color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(row.x, row.y, row.z);
        mesh.userData.color = color;
        nextGroup.add(mesh);
        continue;
      }

      if (row.type === 'implicit3' || row.type === 'inequality3') {
        const dependsKey = [...row.dependsOn].sort().map((name) => `${name}=${params[name]}`).join(',');
        const cacheKey = `${entry.id}|${entry.raw}|${dependsKey}`;
        const cached = cache.get(entry.id);
        let object: THREE.Object3D;
        if (cached && cached.key === cacheKey) {
          object = cached.object;
        } else {
          const group = new THREE.Group();
          const iso = marchingCubes((x, y, z) => row.evaluate(x, y, z, params), BOX, IMPLICIT_RESOLUTION);
          if (iso.positions.length > 0) {
            const geometry = bufferFrom(iso.positions, iso.normals);
            const material = new THREE.MeshStandardMaterial({
              color,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: row.type === 'inequality3' ? 0.55 : 0.65,
              roughness: 0.6,
            });
            group.add(new THREE.Mesh(geometry, material));
          }
          if (row.type === 'inequality3') {
            const fill = buildInequalityFaceFill(row.evaluate, row.comparator, BOX, FACE_FILL_RESOLUTION, params);
            if (fill.positions.length > 0) {
              const fillGeometry = bufferFrom(fill.positions, fill.normals);
              const fillMaterial = new THREE.MeshStandardMaterial({
                color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.35,
                roughness: 0.8,
              });
              group.add(new THREE.Mesh(fillGeometry, fillMaterial));
            }
          }
          object = group;
          cache.set(entry.id, { key: cacheKey, object });
        }
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) child.userData.color = color;
        });
        nextGroup.add(object);
      }
    }

    for (const [id, entry] of cache) {
      if (!seenIds.has(id)) {
        disposeObject(entry.object);
        cache.delete(id);
      }
    }

    disposeObject(t.rowsGroup);
    t.scene.remove(t.rowsGroup);
    t.rowsGroup = nextGroup;
    t.scene.add(nextGroup);
  }, [rows, params, theme]);

  useImperativeHandle(ref, () => ({
    exportPng(pixelScale: number) {
      const t = three.current;
      if (!t) return;
      const originalRatio = t.renderer.getPixelRatio();
      t.renderer.setPixelRatio(pixelScale);
      t.renderer.setSize(size.width, size.height, false);
      t.camera.aspect = size.width / size.height;
      t.camera.updateProjectionMatrix();
      t.renderer.render(t.scene, t.camera);
      t.renderer.domElement.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${fileName}.png`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        requestAnimationFrame(() => URL.revokeObjectURL(url));
      }, 'image/png');
      t.renderer.setPixelRatio(originalRatio);
      t.renderer.setSize(size.width, size.height, false);
      t.camera.aspect = size.width / size.height;
      t.camera.updateProjectionMatrix();
    },
  }));

  // Pointer, wheel and pinch handling, mirroring the 2D canvas's `activePointers` pattern.
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const dragState = useRef<{ pointerId: number; lastX: number; lastY: number; pan: boolean } | null>(null);
  const pinchDistance = useRef<number | null>(null);
  const ROTATE_SPEED = 0.006;

  function pointerPos(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const pos = pointerPos(event);
    activePointers.current.set(event.pointerId, pos);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (activePointers.current.size === 1) {
      dragState.current = { pointerId: event.pointerId, lastX: pos.x, lastY: pos.y, pan: event.shiftKey || event.button === 2 };
    } else if (activePointers.current.size === 2) {
      dragState.current = null;
      const [a, b] = [...activePointers.current.values()];
      if (a && b) pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const pos = pointerPos(event);
    if (activePointers.current.has(event.pointerId)) activePointers.current.set(event.pointerId, pos);

    if (activePointers.current.size === 2) {
      const [a, b] = [...activePointers.current.values()];
      if (a && b) {
        const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        if (pinchDistance.current) onDolly(distance / pinchDistance.current);
        pinchDistance.current = distance;
      }
      return;
    }

    if (dragState.current && dragState.current.pointerId === event.pointerId) {
      const dx = pos.x - dragState.current.lastX;
      const dy = pos.y - dragState.current.lastY;
      dragState.current = { ...dragState.current, lastX: pos.x, lastY: pos.y };
      if (dragState.current.pan) {
        onPan(dx, dy, size.height, (FOV_DEGREES * Math.PI) / 180);
      } else {
        onOrbit(-dx * ROTATE_SPEED, dy * ROTATE_SPEED);
      }
      hideHoverLabel(hoverLabelRef.current);
      return;
    }

    updateHover(event, three.current, rows, size, hoverLabelRef.current);
  }

  function endPointer(event: React.PointerEvent<HTMLDivElement>) {
    activePointers.current.delete(event.pointerId);
    if (dragState.current?.pointerId === event.pointerId) dragState.current = null;
    if (activePointers.current.size < 2) pinchDistance.current = null;
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    onDolly(Math.pow(1.0018, -event.deltaY));
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[22rem] w-full touch-none overflow-hidden rounded-2xl border border-border"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={() => {
        if (!dragState.current) hideHoverLabel(hoverLabelRef.current);
      }}
      onWheel={onWheel}
      onContextMenu={(event) => event.preventDefault()}
      role="img"
      aria-label="Interactive 3D graph. Drag to rotate, shift drag or right drag to pan, scroll or pinch to zoom."
    >
      <div ref={labelContainerRef} className="pointer-events-none absolute inset-0 overflow-hidden">
        {LABEL_ANCHORS.map((anchor, index) => (
          <div
            key={`${anchor.text}-${anchor.position.join(',')}`}
            ref={(el) => {
              labelElements.current[index] = el;
            }}
            className={anchor.axis ? 'text-base font-bold' : 'text-[10px]'}
            style={{
              position: 'absolute',
              color: theme.axisLine,
              textShadow: anchor.axis
                ? `0 0 6px ${theme.background}, 0 0 6px ${theme.background}, 0 0 3px ${theme.background}`
                : undefined,
            }}
          >
            {anchor.text}
          </div>
        ))}
        <div
          ref={hoverLabelRef}
          className="absolute hidden rounded-lg border px-2 py-1 text-xs whitespace-nowrap shadow-[var(--shadow-card)]"
          style={{ borderColor: theme.axisLine, background: theme.background, color: theme.labelText }}
        />
      </div>
    </div>
  );
});

function updateLabelPositions(camera: THREE.PerspectiveCamera, elements: (HTMLDivElement | null)[], container: HTMLDivElement | null) {
  if (!container) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  const projected = new THREE.Vector3();
  for (let i = 0; i < LABEL_ANCHORS.length; i++) {
    const el = elements[i];
    const anchor = LABEL_ANCHORS[i];
    if (!el || !anchor) continue;
    projected.set(anchor.position[0], anchor.position[1], anchor.position[2]);
    projected.project(camera);
    if (projected.z > 1) {
      el.style.opacity = '0';
      continue;
    }
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (1 - (projected.y * 0.5 + 0.5)) * height;
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    el.style.opacity = '1';
  }
}

function hideHoverLabel(el: HTMLDivElement | null) {
  if (el) el.style.display = 'none';
}

function updateHover(
  event: React.PointerEvent<HTMLDivElement>,
  t: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; rowsGroup: THREE.Group } | null,
  rows: RenderRow3d[],
  size: { width: number; height: number },
  hoverLabel: HTMLDivElement | null,
) {
  if (!t || !hoverLabel || rows.length === 0) {
    hideHoverLabel(hoverLabel);
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  const ndcX = ((event.clientX - rect.left) / size.width) * 2 - 1;
  const ndcY = -((event.clientY - rect.top) / size.height) * 2 + 1;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), t.camera);
  const hits = raycaster.intersectObjects(t.rowsGroup.children, true);
  const hit = hits[0];
  if (!hit) {
    hideHoverLabel(hoverLabel);
    return;
  }
  const { x, y, z } = hit.point;
  const color = (hit.object.userData.color as string | undefined) ?? '#666666';
  hoverLabel.style.display = 'block';
  hoverLabel.style.borderColor = color;
  hoverLabel.textContent = `(${Number(x.toPrecision(5))}, ${Number(y.toPrecision(5))}, ${Number(z.toPrecision(5))})`;
  const screenX = ((event.clientX - rect.left) as number) + 14;
  const screenY = ((event.clientY - rect.top) as number) - 10;
  hoverLabel.style.transform = `translate(${screenX}px, ${screenY}px)`;
}
