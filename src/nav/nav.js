// Lightweight nav module using recast-navigation npm packages (WASM)
// Provides: initNav (noop), buildNavForScene, getNavResources, disposeNav, NAV_WORLD_SCALE

import { NavMeshQuery, Crowd, Raw } from 'recast-navigation';
import { threeToTiledNavMesh } from '@recast-navigation/three';

let navMesh = null;
let navMeshQuery = null;
let tileCache = null;
let crowd = null;
let allocator = null;
let compressor = null;

// Keep a single source of truth for world scaling between 2D UI space and 3D nav space
export const NAV_WORLD_SCALE = 4;

export async function initNav() {
  // Ensure WASM is loaded before any generator calls
  if (Raw && Raw.Module) return;
  const core = await import('@recast-navigation/core');
  if (core && typeof core.init === 'function') {
    await core.init();
  } else {
    const { default: wasmFactory } = await import('@recast-navigation/wasm');
    Raw.Module = await wasmFactory();
  }
}

// sceneMeshes: THREE.Mesh[] used for navmesh (e.g., ground plane and static geometry)
// obstacles: array of { type: 'box'|'cylinder', position:{x,y,z}, halfExtents?, angle?, radius?, height? }
export function buildNavForScene(sceneMeshes, obstacles = [], generatorConfig = {}) {
  // Build a tiled navmesh with tile cache so we can add obstacles
  const keepIntermediates = false;
  const defaultConfig = {
    // tighter voxelization so nav hugs walls/corridors
    cs: 8,
    ch: 4,
    walkableSlopeAngle: 50,
    walkableHeight: 24,
    walkableClimb: 8,
    walkableRadius: 6,
    maxEdgeLen: 60,
    maxSimplificationError: 1.2,
    minRegionArea: 64,
    mergeRegionArea: 128,
    maxVertsPerPoly: 6,
    detailSampleDist: 24,
    detailSampleMaxError: 2.0,
    // tiled
    tileSize: 48,
  };

  const config = { ...defaultConfig, ...generatorConfig };

  // Generate a tiled navmesh (no tile cache for now)
  const tnResult = threeToTiledNavMesh(sceneMeshes, config, keepIntermediates);
  if (!tnResult.success) throw new Error('Failed to generate tiled navmesh');
  navMesh = tnResult.navMesh;
  navMeshQuery = new NavMeshQuery(navMesh);
  // Expand default query extents so nearest-poly/path queries work at our scene scale
  if (navMeshQuery && navMeshQuery.defaultQueryHalfExtents) {
    navMeshQuery.defaultQueryHalfExtents = { x: 2000, y: 500, z: 2000 };
  }

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


