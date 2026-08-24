export interface OrbitState {
  /** Radians, measured around the world Y axis. */
  azimuth: number;
  /** Radians above the horizon, clamped so the camera never flips past the poles. */
  elevation: number;
  distance: number;
  target: [number, number, number];
}

export const DEFAULT_ORBIT: OrbitState = {
  azimuth: Math.PI / 4,
  elevation: Math.PI / 6,
  distance: 15,
  target: [0, 0, 0],
};

export const ELEVATION_LIMIT = Math.PI / 2 - 0.02;
const MIN_DISTANCE = 4;
const MAX_DISTANCE = 45;

export function clampElevation(elevation: number): number {
  return Math.max(-ELEVATION_LIMIT, Math.min(ELEVATION_LIMIT, elevation));
}

export function clampDistance(distance: number): number {
  return Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance));
}

export function orbitToPosition(orbit: OrbitState): [number, number, number] {
  const { azimuth, elevation, distance, target } = orbit;
  const horizontal = distance * Math.cos(elevation);
  return [
    target[0] + horizontal * Math.sin(azimuth),
    target[1] + distance * Math.sin(elevation),
    target[2] + horizontal * Math.cos(azimuth),
  ];
}

/** Camera-relative right and up unit vectors, used to convert a screen-space drag into a world pan. */
export function orbitBasis(orbit: OrbitState): { right: [number, number, number]; up: [number, number, number] } {
  const position = orbitToPosition(orbit);
  const fx = orbit.target[0] - position[0];
  const fy = orbit.target[1] - position[1];
  const fz = orbit.target[2] - position[2];
  const flen = Math.hypot(fx, fy, fz) || 1;
  const forward: [number, number, number] = [fx / flen, fy / flen, fz / flen];
  const worldUp: [number, number, number] = [0, 1, 0];
  let rx = forward[1] * worldUp[2] - forward[2] * worldUp[1];
  let ry = forward[2] * worldUp[0] - forward[0] * worldUp[2];
  let rz = forward[0] * worldUp[1] - forward[1] * worldUp[0];
  const rlen = Math.hypot(rx, ry, rz) || 1;
  rx /= rlen;
  ry /= rlen;
  rz /= rlen;
  const ux = ry * forward[2] - rz * forward[1];
  const uy = rz * forward[0] - rx * forward[2];
  const uz = rx * forward[1] - ry * forward[0];
  return { right: [rx, ry, rz], up: [ux, uy, uz] };
}
