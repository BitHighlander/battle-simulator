// Dense game engine core – pure logic, no React
// Exports a single step function that advances the simulation by one frame.

import { NAV_WORLD_SCALE, getNavResources } from '../nav/nav';

export const ENGINE_CONSTANTS = {
  attackCooldownMs: 800,
  baseAttackCooldownMs: 900,
  baseAttackRange: 110, // must match castle visual radius approximation
  separationPadding: 4,
};

function findClosestEnemy(subject, units) {
  let minDistance = Infinity;
  let closest = null;
  for (let i = 0; i < units.length; i++) {
    const enemy = units[i];
    const dx = enemy.x - subject.x;
    const dy = enemy.y - subject.y;
    const d = Math.hypot(dx, dy);
    if (d < minDistance) {
      minDistance = d;
      closest = enemy;
    }
  }
  return closest;
}

function resolveOverlaps(units, width, height, padding = ENGINE_CONSTANTS.separationPadding) {
  const maxIterations = 8;
  for (let iter = 0; iter < maxIterations; iter++) {
    let anyMoved = false;
    for (let i = 0; i < units.length; i++) {
      const a = units[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < units.length; j++) {
        const b = units[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius + padding;
        if (dist === 0 || dist < minDist) {
          const overlap = (minDist - (dist || 0.001)) / 2;
          const nx = (dist === 0 ? (Math.random() - 0.5) : dx) / (dist || 1);
          const ny = (dist === 0 ? (Math.random() - 0.5) : dy) / (dist || 1);
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
          anyMoved = true;
        }
      }
      a.x = Math.max(a.radius, Math.min(width - a.radius, a.x));
      a.y = Math.max(a.radius, Math.min(height - a.radius, a.y));
    }
    if (!anyMoved) break;
  }
  return units;
}

// Advance battle by one frame
export function stepBattleFrame(params) {
  const {
    soldiers,
    bases,
    battlefieldWidth,
    battlefieldHeight,
    winner,
  } = params;

  const messages = [];
  const statsDelta = {
    army1: { killsDelta: 0, aliveDelta: 0 },
    army2: { killsDelta: 0, aliveDelta: 0 },
  };

  // If victory already decided, just return current state
  if (winner) {
    return { soldiers, bases, winner, messages, statsDelta };
  }

  const nextSoldiers = soldiers.map((soldier) => ({ ...soldier }));
  let nextBases = { ...bases, army1: { ...bases.army1 }, army2: { ...bases.army2 } };
  let decidedWinner = null;

  // Utility: increment alive deltas
  const markDeath = (unit) => {
    const team = unit.team;
    if (team === 'army1') statsDelta.army1.aliveDelta -= 1;
    else statsDelta.army2.aliveDelta -= 1;
  };

  for (let idx = 0; idx < nextSoldiers.length; idx++) {
    const soldier = nextSoldiers[idx];
    if (!soldier.alive) continue;
    if (soldier.state === 'celebrating') continue;

    const enemies = nextSoldiers.filter((s) => s.team !== soldier.team && s.alive);

    if (soldier.state === 'retreating') {
      // Retreat to the left/right out of bounds
      soldier.target = null;
      const retreatSpeed = soldier.speed * 0.5;
      const retreatX = soldier.team === 'army1' ? -1 : 1;
      soldier.x += retreatX * retreatSpeed;
      soldier.heading = Math.atan2(retreatX * retreatSpeed, 0);
      if (soldier.x < 0 || soldier.x > battlefieldWidth) {
        soldier.alive = false;
        messages.push(`${soldier.id} has left the battlefield!`);
        markDeath(soldier);
      }
      continue;
    }

    let target = soldier.target;
    if (!target || !target.alive || target.state === 'retreating') {
      target = findClosestEnemy(soldier, enemies);
    }

    const enemyBase = soldier.team === 'army1' ? nextBases.army2 : nextBases.army1;
    const targetPoint = { x: enemyBase.x, y: enemyBase.y };

    if (target) {
      const dx = target.x - soldier.x;
      const dy = target.y - soldier.y;
      const distance = Math.hypot(dx, dy);
      const attackRange = soldier.radius + target.radius + 10;

      if (distance > attackRange) {
        soldier.state = 'moving';
        let moveX = (dx / (distance || 1)) * soldier.speed;
        let moveY = (dy / (distance || 1)) * soldier.speed;
        try {
          const { navMeshQuery } = getNavResources();
          if (navMeshQuery) {
            const scale = NAV_WORLD_SCALE;
            const start = { x: (soldier.x - battlefieldWidth / 2) * scale, y: 0, z: (soldier.y - battlefieldHeight / 2) * scale };
            const end = { x: (targetPoint.x - battlefieldWidth / 2) * scale, y: 0, z: (targetPoint.y - battlefieldHeight / 2) * scale };
            let result = navMeshQuery.computePath(start, end, {
              halfExtents: { x: 2000, y: 500, z: 2000 },
              maxPathPolys: 512,
              maxStraightPathPoints: 512,
            });
            if (!result || !result.success || !result.path || result.path.length < 2) {
              const doorTarget = { x: 0, y: 0, z: start.z };
              result = navMeshQuery.computePath(start, doorTarget, {
                halfExtents: { x: 2000, y: 500, z: 2000 },
                maxPathPolys: 512,
                maxStraightPathPoints: 512,
              });
            }
            if (result && result.success && result.path && result.path.length > 1) {
              const next = result.path[1];
              const nextDx = (next.x / scale + battlefieldWidth / 2) - soldier.x;
              const nextDy = (next.z / scale + battlefieldHeight / 2) - soldier.y;
              const nextDist = Math.hypot(nextDx, nextDy) || 1;
              moveX = (nextDx / nextDist) * soldier.speed;
              moveY = (nextDy / nextDist) * soldier.speed;
            }
          }
        } catch (_) {}

        // Separation steering
        const neighbors = nextSoldiers.filter((s) => s.id !== soldier.id && s.alive);
        let sepX = 0, sepY = 0, neighborCount = 0;
        for (let i = 0; i < neighbors.length; i++) {
          const other = neighbors[i];
          const ndx = soldier.x - other.x;
          const ndy = soldier.y - other.y;
          const nd = Math.hypot(ndx, ndy);
          const desired = soldier.radius + other.radius + 4;
          if (nd > 0 && nd < desired) {
            const weight = (desired - nd) / desired;
            sepX += (ndx / nd) * weight;
            sepY += (ndy / nd) * weight;
            neighborCount++;
          }
        }
        if (neighborCount > 0) {
          const scale = soldier.speed * 0.8;
          moveX += (sepX / neighborCount) * scale;
          moveY += (sepY / neighborCount) * scale;
        }

        const moveMag = Math.hypot(moveX, moveY);
        if (moveMag > 0.0001) {
          soldier.heading = Math.atan2(moveX, moveY);
        }
        soldier.x += moveX;
        soldier.y += moveY;
      } else {
        soldier.state = 'attacking';
        soldier.heading = Math.atan2(dx, dy);
        const now = Date.now();
        if (!soldier.lastAttack || now - soldier.lastAttack > ENGINE_CONSTANTS.attackCooldownMs) {
          target.health -= soldier.damage;
          soldier.lastAttack = now;
          if (target.health <= 0) {
            target.alive = false;
            target.state = 'dead';
            messages.push(`${target.id} has been defeated by ${soldier.id}!`);
            if (soldier.team === 'army1') statsDelta.army1.killsDelta += 1; else statsDelta.army2.killsDelta += 1;
            markDeath(target);
          }
        }
      }
      soldier.target = target;
    }

    // Base attack
    if (soldier.alive) {
      const baseDx = enemyBase.x - soldier.x;
      const baseDy = enemyBase.y - soldier.y;
      const baseDist = Math.hypot(baseDx, baseDy);
      if (baseDist <= ENGINE_CONSTANTS.baseAttackRange) {
        soldier.state = 'attacking';
        const now = Date.now();
        if (!soldier.lastBaseAttack || now - soldier.lastBaseAttack > ENGINE_CONSTANTS.baseAttackCooldownMs) {
          const dmg = soldier.damage;
          if (soldier.team === 'army1') {
            nextBases.army2 = { ...nextBases.army2, hp: Math.max(0, nextBases.army2.hp - dmg) };
          } else {
            nextBases.army1 = { ...nextBases.army1, hp: Math.max(0, nextBases.army1.hp - dmg) };
          }
          soldier.lastBaseAttack = now;
        }
      }
    }
  }

  // Victory condition: base destroyed
  if (nextBases.army1.hp <= 0) decidedWinner = 'army2';
  else if (nextBases.army2.hp <= 0) decidedWinner = 'army1';

  // Resolve overlaps and clamp
  resolveOverlaps(nextSoldiers, battlefieldWidth, battlefieldHeight);

  return {
    soldiers: nextSoldiers,
    bases: nextBases,
    winner: decidedWinner,
    messages,
    statsDelta,
  };
}


