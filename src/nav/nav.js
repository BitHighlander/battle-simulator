// Lightweight nav module using recast-navigation npm packages (WASM)
// Provides: initNav (noop), buildNavForScene, getNavResources, disposeNav

import { NavMeshQuery, Crowd } from 'recast-navigation';
import { threeToTiledNavMesh } from '@recast-navigation/three';

let navMesh = null;
let navMeshQuery = null;
let tileCache = null;
let crowd = null;
let allocator = null;
let compressor = null;

export async function initNav() { return; }

// sceneMeshes: THREE.Mesh[] used for navmesh (e.g., ground plane and static geometry)
// obstacles: array of { type: 'box'|'cylinder', position:{x,y,z}, halfExtents?, angle?, radius?, height? }
export function buildNavForScene(sceneMeshes, obstacles = [], generatorConfig = {}) {
  // Build a tiled navmesh with tile cache so we can add obstacles
  const keepIntermediates = false;
  const defaultConfig = {
    // use coarse voxel/cell sizes to avoid huge grids (our world is in pixels)
    cs: 20,
    ch: 10,
    walkableSlopeAngle: 50,
    walkableHeight: 40,
    walkableClimb: 20,
    walkableRadius: 20,
    maxEdgeLen: 200,
    maxSimplificationError: 4,
    minRegionArea: 400,
    mergeRegionArea: 800,
    maxVertsPerPoly: 6,
    detailSampleDist: 60,
    detailSampleMaxError: 10,
    // tiled
    tileSize: 32,
  };

  const config = { ...defaultConfig, ...generatorConfig };

  // Generate a tiled navmesh (no tile cache for now)
  const tnResult = threeToTiledNavMesh(sceneMeshes, config, keepIntermediates);
  if (!tnResult.success) throw new Error('Failed to generate tiled navmesh');
  navMesh = tnResult.navMesh;
  navMeshQuery = new NavMeshQuery(navMesh);

  // Add requested obstacles
  // TileCache disabled; obstacles are visual-only for now

  // Create a crowd for steering (agents can be added by caller)
  crowd = new Crowd(navMesh, { maxAgents: 256, maxAgentRadius: config.walkableRadius });

  return { navMesh, navMeshQuery, tileCache, crowd };
}

export function getNavResources() {
  return { navMesh, navMeshQuery, tileCache, crowd, allocator, compressor };
}

export function disposeNav() {
  if (crowd) { crowd.destroy?.(); crowd = null; }
  if (tileCache) { tileCache.destroy?.(); tileCache = null; }
  if (navMeshQuery) { navMeshQuery.destroy?.(); navMeshQuery = null; }
  if (navMesh) { navMesh.destroy?.(); navMesh = null; }
  allocator = null; compressor = null;
}


