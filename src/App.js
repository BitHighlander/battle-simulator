// src/App.js

import React, { useState, useEffect, useRef } from 'react';
import Battlefield3D from './components/Battlefield3D';
import './index.css';

function App() {
  const [army1Stats, setArmy1Stats] = useState({
    health: 100,
    damage: 10,
    speed: 1.0,
    morale: 100,
    aliveCount: 0,
    kills: 0,
  });

  const [army2Stats, setArmy2Stats] = useState({
    health: 100,
    damage: 10,
    speed: 1.0,
    morale: 100,
    aliveCount: 0,
    kills: 0,
  });

  const [soldiers, setSoldiers] = useState([]);
  const [battleStarted, setBattleStarted] = useState(false);
  const [winner, setWinner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [celebrationTimer, setCelebrationTimer] = useState(null);

  // Hint overlay state
  const [showHint, setShowHint] = useState(true);

  // References and dimensions
  const battlefieldRef = useRef(null);
  const [battlefieldWidth, setBattlefieldWidth] = useState(800); // default values
  const [battlefieldHeight, setBattlefieldHeight] = useState(600); // default values

  useEffect(() => {
    const updateDimensions = () => {
      if (battlefieldRef.current) {
        setBattlefieldWidth(battlefieldRef.current.offsetWidth);
        setBattlefieldHeight(battlefieldRef.current.offsetHeight);
      }
    };

    // Initial call (next frame to ensure layout settled)
    requestAnimationFrame(updateDimensions);

    // Update dimensions on window resize
    window.addEventListener('resize', updateDimensions);

    // Observe container size changes as well
    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined' && battlefieldRef.current) {
      resizeObserver = new ResizeObserver(() => updateDimensions());
      resizeObserver.observe(battlefieldRef.current);
    }

    // Initialize 50v50 soldiers with grid formations
    const initializeSoldiers = () => {
      const newSoldiers = [];
      const columns = 10; // grid columns per army
      const rows = 5; // rows per army (10 x 5 = 50)
      const soldierSpacingX = Math.max(100, battlefieldWidth / 20);
      const soldierSpacingY = Math.max(100, battlefieldHeight / 12);
      const startOffsetX = 250;
      const startOffsetY = battlefieldHeight / 2 - ((rows - 1) * soldierSpacingY) / 2;

      // Army 1 (left side, facing right)
      for (let i = 0; i < rows * columns; i++) {
        const row = Math.floor(i / columns);
        const col = i % columns;
        const x = startOffsetX + col * soldierSpacingX;
        const y = startOffsetY + row * soldierSpacingY;

        const soldier = {
          id: `army1-${i}`,
          x: Math.max(20, Math.min(battlefieldWidth - 20, x)),
          y: Math.max(20, Math.min(battlefieldHeight - 20, y)),
          health: army1Stats.health,
          maxHealth: army1Stats.health,
          damage: army1Stats.damage,
          speed: army1Stats.speed,
          morale: army1Stats.morale,
          maxMorale: army1Stats.morale,
          team: 'army1',
          color: 'blue-500',
          alive: true,
          state: 'idle',
          radius: 16,
        };
        newSoldiers.push(soldier);
      }

      // Army 2 (right side, facing left)
      for (let i = 0; i < rows * columns; i++) {
        const row = Math.floor(i / columns);
        const col = i % columns;
        const x = battlefieldWidth - startOffsetX - col * soldierSpacingX;
        const y = startOffsetY + row * soldierSpacingY;

        const soldier = {
          id: `army2-${i}`,
          x: Math.max(20, Math.min(battlefieldWidth - 20, x)),
          y: Math.max(20, Math.min(battlefieldHeight - 20, y)),
          health: army2Stats.health,
          maxHealth: army2Stats.health,
          damage: army2Stats.damage,
          speed: army2Stats.speed,
          morale: army2Stats.morale,
          maxMorale: army2Stats.morale,
          team: 'army2',
          color: 'red-500',
          alive: true,
          state: 'idle',
          radius: 16,
        };
        newSoldiers.push(soldier);
      }

      // Resolve any initial overlaps from formation layout
      resolveOverlaps(newSoldiers, battlefieldWidth, battlefieldHeight);
      setSoldiers(newSoldiers);
      setArmy1Stats(prev => ({ ...prev, aliveCount: rows * columns }));
      setArmy2Stats(prev => ({ ...prev, aliveCount: rows * columns }));
    };

    // Initialize soldiers after dimensions are set
    const initTimer = setTimeout(() => {
      initializeSoldiers();
      setShowHint(false); // Don't show hint for auto-placement
    }, 500);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      if (resizeObserver && battlefieldRef.current) resizeObserver.disconnect();
      clearTimeout(initTimer);
    };
  }, [battlefieldRef]);



  const startSimulation = () => {
    if (soldiers.length < 20) {
      alert('Waiting for soldiers to be placed. Please refresh if needed.');
      return;
    }

    setWinner(null);
    setMessages([]);
    setCelebrationTimer(null);

    // Reset alive counts and kills
    setArmy1Stats((prev) => ({
      ...prev,
      aliveCount: soldiers.filter((s) => s.team === 'army1').length,
      kills: 0,
    }));
    setArmy2Stats((prev) => ({
      ...prev,
      aliveCount: soldiers.filter((s) => s.team === 'army2').length,
      kills: 0,
    }));

    // Helper function to apply random variance within ±5%
    const applyVariance = (value) => {
      const variance = 0.05; // 5%
      const min = value * (1 - variance);
      const max = value * (1 + variance);
      return Math.random() * (max - min) + min;
    };

    // Update soldiers' stats according to their army stats
    const updatedSoldiers = soldiers.map((soldier) => {
      const armyStats = soldier.team === 'army1' ? army1Stats : army2Stats;
      return {
        ...soldier,
        health: armyStats.health,
        maxHealth: armyStats.health,
        damage: applyVariance(armyStats.damage),
        speed: applyVariance(armyStats.speed),
        morale: armyStats.morale,
        maxMorale: armyStats.morale,
        alive: true,
        state: 'idle',
        lastAttack: null,
      };
    });

    setSoldiers(updatedSoldiers);
    setBattleStarted(true);
  };

  const resetSimulation = () => {
    setBattleStarted(false);
    setSoldiers([]);
    setWinner(null);
    setMessages([]);
    setCelebrationTimer(null);

    // Reset alive counts and kills
    setArmy1Stats((prev) => ({
      ...prev,
      aliveCount: 0,
      kills: 0,
    }));
    setArmy2Stats((prev) => ({
      ...prev,
      aliveCount: 0,
      kills: 0,
    }));
  };

  useEffect(() => {
    let animationFrameId;

    const updateSimulation = () => {
      let defeatedTeams = {};
      let battleEnded = false;
      let winningTeam = null;

      let updatedSoldiers = soldiers.map((soldier) => {
        if (!soldier.alive) return soldier;

        // Skip action for soldiers who are celebrating
        if (soldier.state === 'celebrating') return soldier;

        const enemies = soldiers.filter((s) => s.team !== soldier.team && s.alive);

        const allies = soldiers.filter((s) => s.team === soldier.team && s.alive && s.id !== soldier.id);

        // Check for battle end
        const activeEnemies = enemies.filter((s) => s.alive);

        // Game ends only when all enemies are dead
        if (activeEnemies.length === 0 && !winner) {
          setWinner(soldier.team);
          setMessages((msgs) => [...msgs, `${soldier.team} wins! Celebrating...`]);

          battleEnded = true;
          winningTeam = soldier.team;

          // End game after 5 seconds
          setCelebrationTimer(
            setTimeout(() => {
              setBattleStarted(false);
              setMessages((msgs) => [...msgs, `Game over. ${soldier.team} wins!`]);
            }, 5000)
          );

          return soldier;
        }

        if (soldier.state === 'retreating') {
          // Move soldier away from battle at a slower speed
          soldier.target = null; // Clear any target
          const retreatSpeed = soldier.speed * 0.5; // Retreating speed is half
          // Determine retreat direction
          let retreatX = soldier.team === 'army1' ? -1 : 1;
          soldier.x += retreatX * retreatSpeed;
          // Remove soldier if they leave the battlefield bounds
          if (soldier.x < 0 || soldier.x > battlefieldWidth) {
            soldier.alive = false;
            setMessages((msgs) => [...msgs, `${soldier.id} has left the battlefield!`]);

            // Decrease alive count
            if (soldier.team === 'army1') {
              setArmy1Stats((prev) => ({
                ...prev,
                aliveCount: prev.aliveCount - 1,
              }));
            } else {
              setArmy2Stats((prev) => ({
                ...prev,
                aliveCount: prev.aliveCount - 1,
              }));
            }
          }
          return soldier;
        }

        let target = soldier.target;
        if (!target || !target.alive || target.state === 'retreating') {
          target = findClosestEnemy(soldier, enemies);
        }

        if (target) {
          const dx = target.x - soldier.x;
          const dy = target.y - soldier.y;
          const distance = Math.hypot(dx, dy);

          // Move towards target if not within effective attack range
          // Add a small buffer so units attack before overlap-resolution pushes them apart
          const attackRange = soldier.radius + target.radius + 10;
          if (distance > attackRange) {
            soldier.state = 'moving';

            // Calculate desired movement
            let moveX = (dx / (distance || 1)) * soldier.speed;
            let moveY = (dy / (distance || 1)) * soldier.speed;

            // Separation steering from nearby units
            const neighbors = soldiers.filter((s) => s.id !== soldier.id && s.alive);
            let sepX = 0;
            let sepY = 0;
            let neighborCount = 0;
            neighbors.forEach((other) => {
              const ndx = soldier.x - other.x;
              const ndy = soldier.y - other.y;
              const nd = Math.hypot(ndx, ndy);
              const desired = soldier.radius + other.radius + 4; // desired separation
              if (nd > 0 && nd < desired) {
                const weight = (desired - nd) / desired; // stronger when closer
                sepX += (ndx / nd) * weight;
                sepY += (ndy / nd) * weight;
                neighborCount++;
              }
            });
            if (neighborCount > 0) {
              // Normalize separation and scale
              const scale = soldier.speed * 0.8;
              moveX += (sepX / neighborCount) * scale;
              moveY += (sepY / neighborCount) * scale;
            }

            soldier.x += moveX;
            soldier.y += moveY;
          } else {
            // In range: adopt attacking posture; apply damage on cooldown
            soldier.state = 'attacking';
            const now = Date.now();
            if (!soldier.lastAttack || now - soldier.lastAttack > 800) {
              target.health -= soldier.damage;
              soldier.lastAttack = now;
              if (target.health <= 0) {
                target.alive = false;
                target.state = 'dead';
                setMessages((msgs) => [...msgs, `${target.id} has been defeated by ${soldier.id}!`]);

                // Increase kills for the soldier's team
                if (soldier.team === 'army1') {
                  setArmy1Stats((prev) => ({
                    ...prev,
                    kills: prev.kills + 1,
                  }));
                } else {
                  setArmy2Stats((prev) => ({
                    ...prev,
                    kills: prev.kills + 1,
                  }));
                }

                // Decrease alive count for the target's team
                if (target.team === 'army1') {
                  setArmy1Stats((prev) => ({
                    ...prev,
                    aliveCount: prev.aliveCount - 1,
                  }));
                } else {
                  setArmy2Stats((prev) => ({
                    ...prev,
                    aliveCount: prev.aliveCount - 1,
                  }));
                }

                // Mark that a soldier from target's team has died
                defeatedTeams[target.team] = (defeatedTeams[target.team] || 0) + 1;
              }
            }
          }
          soldier.target = target;
        }

        return soldier;
      });

      // After mapping, set celebrating state for the winning team's soldiers
      if (battleEnded) {
        updatedSoldiers = updatedSoldiers.map((s) => {
          if (s.team === winningTeam && s.alive) {
            s.state = 'celebrating';
          }
          return s;
        });
      }

      // After mapping, decrease morale of soldiers in teams that had soldiers die
      Object.keys(defeatedTeams).forEach((team) => {
        const moraleDecrease = (10 * Math.pow(defeatedTeams[team], 4)) / (soldiers.length / 10); // Adjust as needed
        updatedSoldiers = updatedSoldiers.map((s) => {
          if (s.team === team && s.alive && s.state !== 'retreating') {
            s.morale -= moraleDecrease;
            if (s.morale <= 0 && s.state !== 'retreating') {
              s.state = 'retreating';
              setMessages((msgs) => [...msgs, `${s.id} is retreating due to low morale!`]);
            }
          }
          return s;
        });
      });

      // After movement/attacks, resolve overlaps to prevent stacking
      resolveOverlaps(updatedSoldiers, battlefieldWidth, battlefieldHeight);
      setSoldiers(updatedSoldiers);
      animationFrameId = requestAnimationFrame(updateSimulation);
    };

    if (battleStarted) {
      animationFrameId = requestAnimationFrame(updateSimulation);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (celebrationTimer) {
        clearTimeout(celebrationTimer);
      }
    };
  }, [battleStarted, winner, soldiers]);

  const findClosestEnemy = (soldier, enemies) => {
    let minDistance = Infinity;
    let closest = null;
    enemies.forEach((enemy) => {
      const dx = enemy.x - soldier.x;
      const dy = enemy.y - soldier.y;
      const distance = Math.hypot(dx, dy);
      if (distance < minDistance) {
        minDistance = distance;
        closest = enemy;
      }
    });
    return closest;
  };

  const detectCollisions = (soldier, others) => {
    const collisions = [];
    others.forEach((other) => {
      const dx = other.x - soldier.x;
      const dy = other.y - soldier.y;
      const distance = Math.hypot(dx, dy);
      if (distance < soldier.radius + other.radius) {
        collisions.push(other);
      }
    });
    return collisions;
  };

  // Enforce non-overlapping by resolving pairwise overlaps (circle bounds)
  const resolveOverlaps = (units, width, height) => {
    const maxIterations = 8;
    const padding = 4; // extra spacing
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
            // Push both units apart equally
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            b.x += nx * overlap;
            b.y += ny * overlap;
            anyMoved = true;
          }
        }
        // Clamp to battlefield bounds
        a.x = Math.max(a.radius, Math.min(width - a.radius, a.x));
        a.y = Math.max(a.radius, Math.min(height - a.radius, a.y));
      }
      if (!anyMoved) break;
    }
    return units;
  };

  return (
    <div
      className="app-shell flex flex-col min-h-screen bg-gray-900 prevent-select"
      onClick={() => {
        if (showHint) setShowHint(false);
      }}
    >
      {/* Battlefield */}
      <div
        className="relative w-full p-4 bg-gradient-to-b from-gray-800 to-gray-900 overflow-hidden flex-grow noscroll"
      >
        <div
          ref={battlefieldRef}
          className="relative battlefield h-full rounded-lg shadow-lg bg-gray-800"
        >
          {/* Status Overlay */}
          {!battleStarted && soldiers.length > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 z-10 pointer-events-none">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white mb-2">10 vs 10 Battle Ready</h2>
                <p className="text-lg text-gray-200">Click "Start Simulation" to begin the battle</p>
                <p className="text-sm text-gray-300 mt-2">Use mouse to zoom and rotate the view</p>
              </div>
            </div>
          )}

          {/* HUD UI Overlay */}
          <div className="absolute top-0 left-0 w-full flex flex-col md:flex-row justify-between p-4 space-y-4 md:space-y-0 z-20">
            {/* Army 1 HUD */}
            <div className="flex items-center space-x-2 bg-blue-900 bg-opacity-70 p-2 rounded">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <div>
                <p className="text-blue-300 font-semibold text-sm">Army 1</p>
                <p className="text-xs text-white">Alive Soldiers: {army1Stats.aliveCount}</p>
                <p className="text-xs text-white">Kills: {army1Stats.kills}</p>
              </div>
            </div>
            {/* Army 2 HUD */}
            <div className="flex items-center space-x-2 bg-red-900 bg-opacity-70 p-2 rounded">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <div>
                <p className="text-red-300 font-semibold text-sm">Army 2</p>
                <p className="text-xs text-white">Alive Soldiers: {army2Stats.aliveCount}</p>
                <p className="text-xs text-white">Kills: {army2Stats.kills}</p>
              </div>
            </div>
          </div>

          <Battlefield3D
            soldiers={soldiers}
            battlefieldWidth={battlefieldWidth}
            battlefieldHeight={battlefieldHeight}
          />
          {winner && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 z-30">
              <h1 className="text-5xl font-bold text-white">{winner.toUpperCase()} WINS!</h1>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="w-full p-4 bg-gray-800">
        {/* Control Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 mb-10 max-w-md mx-auto">
          <button
            onClick={startSimulation}
            className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={battleStarted || soldiers.length === 0}
          >
            {battleStarted ? 'Battle in Progress' : 'Start 50v50 Battle'}
          </button>
          <button
            onClick={resetSimulation}
            className="bg-red-600 text-white px-6 py-3 rounded hover:bg-red-700 transition font-semibold"
          >
            Reset Battle
          </button>
        </div>

        {/* Messages */}
        {/* <div className="mb-4">
          <h2 className="text-2xl font-semibold mb-2 text-white">Messages</h2>
          <div className="max-h-32 md:max-h-48 overflow-y-auto border border-gray-700 p-2 bg-gray-700 text-white rounded">
            {messages.map((msg, index) => (
              <p key={index} className="text-sm">
                {msg}
              </p>
            ))}
          </div>
        </div> */}
        
        <div className="army-stats grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Army 1 Stats */}
          <div>
            <h2 className="text-2xl font-semibold mb-2 text-blue-400">Army 1 Stats</h2>
            <div className="grid grid-cols-1 gap-4">
              {Object.keys(army1Stats)
                .filter((stat) => !['aliveCount', 'kills'].includes(stat))
                .map((stat) => (
                  <label key={stat} className="block">
                    <span className="text-gray-300 capitalize text-sm">{stat}:</span>
                    <input
                      type="number"
                      value={army1Stats[stat]}
                      onChange={(e) =>
                        setArmy1Stats({
                          ...army1Stats,
                          [stat]: parseFloat(e.target.value),
                        })
                      }
                      className="w-full mt-1 p-2 border rounded text-sm bg-gray-700 border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0.1"
                      step="0.1"
                    />
                  </label>
                ))}
            </div>
          </div>
          {/* Army 2 Stats */}
          <div>
            <h2 className="text-2xl font-semibold mb-2 text-red-400">Army 2 Stats</h2>
            <div className="grid grid-cols-1 gap-4">
              {Object.keys(army2Stats)
                .filter((stat) => !['aliveCount', 'kills'].includes(stat))
                .map((stat) => (
                  <label key={stat} className="block">
                    <span className="text-gray-300 capitalize text-sm">{stat}:</span>
                    <input
                      type="number"
                      value={army2Stats[stat]}
                      onChange={(e) =>
                        setArmy2Stats({
                          ...army2Stats,
                          [stat]: parseFloat(e.target.value),
                        })
                      }
                      className="w-full mt-1 p-2 border rounded text-sm bg-gray-700 border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                      min="0.1"
                      step="0.1"
                    />
                  </label>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
