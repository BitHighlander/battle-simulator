import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

function Battlefield3D({ soldiers, battlefieldWidth, battlefieldHeight }) {
  const mountRef = useRef(null);
  const controlsRef = useRef(null);
  const sceneRef = useRef(null);
  const [camera, setCamera] = useState(null);
  const [renderer, setRenderer] = useState(null);
  const [instancedMesh, setInstancedMesh] = useState(null);
  const [dummy, setDummy] = useState(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const baseModelsRef = useRef({ army1: null, army2: null });
  const animationsRef = useRef({ army1: [], army2: [] });
  const soldierObjectsRef = useRef(new Map()); // soldierId -> { object3D, mixer, actions }
  const clockRef = useRef(new THREE.Clock());
  const puddlesRef = useRef([]); // { mesh, removeAt }

  // Helper function to find animation clip with graceful fallbacks
  const findAnimation = (animations, name) => {
    if (!animations || animations.length === 0) return null;
    // Exact match first
    const exact = animations.find((clip) => clip.name === name);
    if (exact) return exact;
    // Case-insensitive contains fallback
    const lowered = name.toLowerCase();
    const contains = animations.find((clip) => clip.name.toLowerCase().includes(lowered));
    if (contains) return contains;
    // Heuristic fallbacks by intent
    const heuristics = {
      attack: ['attack', 'slash', 'strike', 'chop', 'melee'],
      walk: ['walk', 'run', 'move'],
      idle: ['idle', 'breath', 'stand'],
      death: ['death', 'die'],
    };
    let keywords = [];
    if (lowered.includes('attack') || lowered.includes('chop') || lowered.includes('melee')) keywords = heuristics.attack;
    else if (lowered.includes('walk')) keywords = heuristics.walk;
    else if (lowered.includes('idle')) keywords = heuristics.idle;
    else if (lowered.includes('death')) keywords = heuristics.death;
    for (const kw of keywords) {
      const byKw = animations.find((clip) => clip.name.toLowerCase().includes(kw));
      if (byKw) return byKw;
    }
    // Fallback to first available clip
    return animations[0] || null;
  };


  useEffect(() => {
    // Initialize Three.js scene
    const initThreeJS = () => {
      const mountEl = mountRef.current;
      if (!mountEl) return () => {};
      // Clear any previous canvas appended by this component
      while (mountEl.firstChild) {
        mountEl.removeChild(mountEl.firstChild);
      }
      // Scene
      const newScene = new THREE.Scene();
      newScene.background = new THREE.Color(0x87CEEB); // Sky blue
      sceneRef.current = newScene;

      // Camera positioning using 1:1 world units (pixels to units)
      const maxDim = Math.max(battlefieldWidth, battlefieldHeight);
      // Camera
      const newCamera = new THREE.PerspectiveCamera(
        75,
        battlefieldWidth / battlefieldHeight,
        0.1,
        maxDim * 10 // far plane based on scene size to avoid clipping
      );
      newCamera.position.set(0, maxDim * 0.8, maxDim * 1.2);
      newCamera.lookAt(0, 0, 0);

      // Add OrbitControls for zoom and camera movement
      const controls = new OrbitControls(newCamera, mountRef.current);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.screenSpacePanning = false;
      controls.minDistance = maxDim * 0.2;
      controls.maxDistance = maxDim * 2.5;
      controls.maxPolarAngle = Math.PI / 2.2; // Prevent camera from going below ground
      controlsRef.current = controls;

      // Renderer
      const newRenderer = new THREE.WebGLRenderer({ antialias: true });
      newRenderer.setSize(battlefieldWidth, battlefieldHeight);
      newRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      newRenderer.shadowMap.enabled = true;
      newRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

      // Lighting
      const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
      newScene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(50, 100, 50);
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
      directionalLight.shadow.camera.near = 0.5;
      directionalLight.shadow.camera.far = maxDim * 4;
      directionalLight.shadow.camera.left = -battlefieldWidth / 2;
      directionalLight.shadow.camera.right = battlefieldWidth / 2;
      directionalLight.shadow.camera.top = battlefieldHeight / 2;
      directionalLight.shadow.camera.bottom = -battlefieldHeight / 2;
      newScene.add(directionalLight);

      // Ground plane (slightly larger than battlefield dimensions to avoid edge artifacts)
      const groundScale = 4; // larger to fill view in oblique angles
      const groundGeometry = new THREE.PlaneGeometry(battlefieldWidth * groundScale, battlefieldHeight * groundScale);
      const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x4a5d23 });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      newScene.add(ground);

      // Procedural sky
      const sky = new Sky();
      sky.scale.setScalar(maxDim * 10);
      newScene.add(sky);
      // Configure sky uniforms
      const elevation = 35;
      const azimuth = 180;
      const sun = new THREE.Vector3();
      const phi = THREE.MathUtils.degToRad(90 - elevation);
      const theta = THREE.MathUtils.degToRad(azimuth);
      sun.setFromSphericalCoords(1, phi, theta);
      sky.material.uniforms['turbidity'].value = 10;
      sky.material.uniforms['rayleigh'].value = 2;
      sky.material.uniforms['mieCoefficient'].value = 0.005;
      sky.material.uniforms['mieDirectionalG'].value = 0.8;
      sky.material.uniforms['sunPosition'].value.copy(sun);
      // Optional light-match
      newScene.fog = new THREE.Fog(new THREE.Color(0x87CEEB), maxDim * 2, maxDim * 20);

      // Create instanced mesh fallback (cylinders) if models not loaded
      const soldierHeight = 20;
      const soldierRadius = 8;
      const soldierGeometry = new THREE.CylinderGeometry(soldierRadius, soldierRadius, soldierHeight, 12);
      const soldierMaterial = new THREE.MeshLambertMaterial();

      const newDummy = new THREE.Mesh(soldierGeometry, soldierMaterial);
      setDummy(newDummy);

      const newInstancedMesh = new THREE.InstancedMesh(
        soldierGeometry,
        soldierMaterial,
        100
      );
      newInstancedMesh.castShadow = true;
      newInstancedMesh.receiveShadow = true;
      newInstancedMesh.count = 0;
      newScene.add(newInstancedMesh);



      // Store references
      setCamera(newCamera);
      setRenderer(newRenderer);
      setInstancedMesh(newInstancedMesh);

      // Mount renderer
      mountEl.appendChild(newRenderer.domElement);

      // Animation loop
      let rafId = 0;
      const animate = () => {
        rafId = requestAnimationFrame(animate);
        // Advance any active mixers when using GLTFs
        const delta = clockRef.current.getDelta();
        soldierObjectsRef.current.forEach((entry) => {
          if (entry.mixer) entry.mixer.update(delta);
        });

        // Fade and cleanup blood puddles
        if (puddlesRef.current.length > 0) {
          const now = Date.now();
          for (let i = puddlesRef.current.length - 1; i >= 0; i--) {
            const p = puddlesRef.current[i];
            if (p.mesh.material.opacity > 0.05) {
              p.mesh.material.opacity = Math.max(0, p.mesh.material.opacity - delta * 0.1);
            }
            if (now > p.removeAt) {
              newScene.remove(p.mesh);
              if (p.mesh.geometry) p.mesh.geometry.dispose();
              if (p.mesh.material) p.mesh.material.dispose();
              puddlesRef.current.splice(i, 1);
            }
          }
        }
        newRenderer.render(newScene, newCamera);
      };
      animate();
      // Provide cleanup for this init
      return () => {
        cancelAnimationFrame(rafId);
        try { mountEl.removeChild(newRenderer.domElement); } catch (_) {}
        newRenderer.dispose();
      };
    };

    const cleanup = initThreeJS();

    // Cleanup
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, [battlefieldWidth, battlefieldHeight]);

  // Update soldier positions when soldiers array changes
  useEffect(() => {
    if (!sceneRef.current) return;

    const scene = sceneRef.current;

    

    // If models are loaded, render them per-soldier; otherwise use instancing fallback
    if (modelsLoaded && baseModelsRef.current.army1 && baseModelsRef.current.army2) {
      // Create/update 3D objects per soldier
      const activeIds = new Set();
      soldiers.forEach((soldier) => {
        // Allow dead soldiers to remain briefly to play death animation
        let entry = soldierObjectsRef.current.get(soldier.id);
        // Do not create new objects for already-dead soldiers
        if (!entry && !soldier.alive) {
          return;
        }
        if (!entry) {
          const base = soldier.team === 'army1' ? baseModelsRef.current.army1 : baseModelsRef.current.army2;
          const animations = soldier.team === 'army1' ? animationsRef.current.army1 : animationsRef.current.army2;
          const cloned = cloneSkeleton(base);
          // Set a reasonable scale for the models
          cloned.scale.setScalar(50); // Make models MUCH larger to test visibility
          let meshCount = 0;
          cloned.traverse((obj) => {
            if (obj.isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
              meshCount++;
            }
          });
          scene.add(cloned);
          const mixer = new THREE.AnimationMixer(cloned);

          // Set up animation actions with safe fallbacks
          const actions = {};
          const attackClip = findAnimation(animations, '1H_Melee_Attack_Chop') || findAnimation(animations, 'attack');
          const deathClip = findAnimation(animations, 'Death_A') || findAnimation(animations, 'death');
          const idleClip = findAnimation(animations, 'Idle') || findAnimation(animations, 'idle');
          const walkClip = findAnimation(animations, 'Walking_A') || findAnimation(animations, 'walk');

          if (attackClip) {
            actions.attack = mixer.clipAction(attackClip);
            actions.attack.setLoop(THREE.LoopRepeat, Infinity);
          }
          if (deathClip) {
            actions.death = mixer.clipAction(deathClip);
            actions.death.setLoop(THREE.LoopOnce, 1);
            actions.death.clampWhenFinished = true;
          }
          if (idleClip) {
            actions.idle = mixer.clipAction(idleClip);
            actions.idle.setLoop(THREE.LoopRepeat, Infinity);
          }
          if (walkClip) {
            actions.walk = mixer.clipAction(walkClip);
            actions.walk.setLoop(THREE.LoopRepeat, Infinity);
          }

          // If no basic actions were found, fall back to first clip as idle
          if (!actions.idle && animations && animations.length > 0) {
            const fallback = mixer.clipAction(animations[0]);
            fallback.setLoop(THREE.LoopRepeat, Infinity);
            actions.idle = fallback;
          }

          entry = { object3D: cloned, mixer, actions, removeAt: null, hasPlayedDeath: false, currentAnimation: null, deathHandler: null };
          soldierObjectsRef.current.set(soldier.id, entry);
        }

        const { object3D, mixer, actions } = entry;
        const worldX = soldier.x - battlefieldWidth / 2;
        const worldZ = soldier.y - battlefieldHeight / 2;
        // Position slightly above ground for visibility
        object3D.position.set(worldX, 5, worldZ);

        // Face direction
        let targetRotation = soldier.team === 'army1' ? 0 : Math.PI;
        if (soldier.target && soldier.target.alive) {
          const dx = soldier.target.x - soldier.x;
          const dy = soldier.target.y - soldier.y;
          targetRotation = Math.atan2(dx, dy);
        }
        object3D.rotation.y = targetRotation;

        // Play animations based on soldier state
        let targetAnimation = 'idle';
        if (!soldier.alive && actions.death) {
          targetAnimation = 'death';
        } else if (soldier.state === 'attacking' && actions.attack) {
          targetAnimation = 'attack';
        } else if ((soldier.state === 'moving' || soldier.state === 'retreating') && actions.walk) {
          targetAnimation = 'walk';
        } else if (soldier.state === 'in_combat' && actions.attack) {
          // loop subtle attack-ready/idle if available; fallback to idle when attack not looping
          targetAnimation = actions.walk ? 'walk' : 'idle';
        } else if (actions.idle) {
          targetAnimation = 'idle';
        }

        // Cross-fade with special handling for death (play once)
        const allKeys = Object.keys(actions);
        const getAction = (name) => actions[name];
        if (targetAnimation === 'death' && getAction('death')) {
          if (!entry.hasPlayedDeath) {
            // Stop others and play death once
            allKeys.forEach((k) => {
              if (k !== 'death' && actions[k]) actions[k].stop();
            });
            getAction('death').reset().setLoop(THREE.LoopOnce, 1).play();
            entry.hasPlayedDeath = true;
            entry.currentAnimation = 'death';
            // When death animation finishes, schedule removal shortly after
            if (!entry.deathHandler) {
              const onFinish = (e) => {
                if (e.action === actions.death) {
                  entry.removeAt = Date.now() + 100;
                  entry.deathHandler = null;
                  mixer.removeEventListener('finished', onFinish);
                }
              };
              mixer.addEventListener('finished', onFinish);
              entry.deathHandler = onFinish;
            }
          }
          // Do not restart death after it finishes
        } else {
          const next = getAction(targetAnimation) || getAction('idle');
          if (next && entry.currentAnimation !== targetAnimation) {
            const current = entry.currentAnimation ? getAction(entry.currentAnimation) : null;
            if (current && current.isRunning && current.isRunning()) {
              next.reset().fadeIn(0.12).play();
              current.fadeOut(0.12);
            } else {
              next.reset().play();
            }
            entry.currentAnimation = targetAnimation;
          }
        }
        const keepAliveForDeath = !soldier.alive && entry.removeAt && Date.now() < entry.removeAt;
        const deathPlaying = !soldier.alive && entry.currentAnimation === 'death' && !entry.removeAt;
        if (soldier.alive || keepAliveForDeath || deathPlaying) {
          activeIds.add(soldier.id);
        } else if (!soldier.alive && entry.removeAt && Date.now() >= entry.removeAt) {
          // Spawn a small red puddle at the death location
          const puddleRadius = 20;
          const geometry = new THREE.CircleGeometry(puddleRadius, 24);
          const material = new THREE.MeshBasicMaterial({ color: 0x660000, transparent: true, opacity: 0.8 });
          const puddle = new THREE.Mesh(geometry, material);
          puddle.rotation.x = -Math.PI / 2;
          puddle.position.copy(entry.object3D.position.clone());
          puddle.position.y = 0.1; // slightly above ground to avoid z-fight
          scene.add(puddle);
          puddlesRef.current.push({ mesh: puddle, removeAt: Date.now() + 7000 });
        }
      });

      // Remove stale soldier objects
      const toRemove = [];
      soldierObjectsRef.current.forEach((entry, id) => {
        if (!activeIds.has(id)) {
          scene.remove(entry.object3D);
          // Dispose geometries/materials to avoid leaks
          try {
            entry.object3D.traverse((obj) => {
              if (obj.isMesh) {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                  if (Array.isArray(obj.material)) obj.material.forEach((m) => m && m.dispose && m.dispose());
                  else if (obj.material.dispose) obj.material.dispose();
                }
              }
            });
          } catch (_) {}
          toRemove.push(id);
        }
      });
      toRemove.forEach((id) => soldierObjectsRef.current.delete(id));

      

      // Debug: Log soldier positions
      

      // Hide instanced fallback when models are used
      if (instancedMesh) instancedMesh.count = 0;
      return;
    }

    
    if (!instancedMesh || !dummy) return;
    const visibleSoldiers = soldiers.filter(s => s.alive);
    instancedMesh.count = visibleSoldiers.length;
    
    visibleSoldiers.forEach((soldier, index) => {
      if (index >= instancedMesh.count) return;

      // Convert 2D position (pixels) directly to 3D world coordinates
      const worldX = soldier.x - battlefieldWidth / 2;
      const worldZ = soldier.y - battlefieldHeight / 2;

      // Place cylinder centered on ground
      dummy.position.set(worldX, 10, worldZ);

      // Calculate direction based on target or movement
      let targetRotation = 0;
      if (soldier.target && soldier.target.alive) {
        // Face towards target
        const dx = soldier.target.x - soldier.x;
        const dy = soldier.target.y - soldier.y;
        targetRotation = Math.atan2(dx, dy);
      } else if (soldier.state === 'moving') {
        // Keep current direction when moving
        targetRotation = dummy.rotation.y;
      } else {
        // Default facing (towards enemy side)
        targetRotation = soldier.team === 'army1' ? 0 : Math.PI;
      }

      // Add animation based on soldier state
      switch (soldier.state) {
        case 'attacking':
          dummy.rotation.y = targetRotation + Math.sin(Date.now() * 0.01) * 0.3; // Slight rotation around target
          dummy.scale.setScalar(1.1); // Slightly larger when attacking
          break;
        case 'retreating':
          dummy.rotation.y = targetRotation + Math.sin(Date.now() * 0.02) * 0.5; // More rotation when retreating
          dummy.scale.setScalar(0.9); // Smaller when retreating
          break;
        case 'celebrating':
          dummy.rotation.y += 0.02; // Continuous rotation
          dummy.scale.setScalar(1.2); // Larger when celebrating
          break;
        default:
          dummy.rotation.y = targetRotation;
          dummy.scale.setScalar(1.0);
          break;
      }

      dummy.updateMatrix();

      // Set color based on team
      const color = soldier.team === 'army1'
        ? new THREE.Color(0x0000ff) // Blue
        : new THREE.Color(0xff0000); // Red

      instancedMesh.setColorAt(index, color);
      instancedMesh.setMatrixAt(index, dummy.matrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) {
      instancedMesh.instanceColor.needsUpdate = true;
    }
  }, [soldiers, instancedMesh, dummy, battlefieldWidth, battlefieldHeight]);

  // Handle window resize
  useEffect(() => {
    if (!camera || !renderer) return;

    const handleResize = () => {
      camera.aspect = battlefieldWidth / battlefieldHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(battlefieldWidth, battlefieldHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [camera, renderer, battlefieldWidth, battlefieldHeight]);

  // Load GLTF models once
  useEffect(() => {
    let cancelled = false;

    // Set up GLTFLoader with DRACO decoder
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/libs/');
    loader.setDRACOLoader(dracoLoader);

    const loadModel = async (path) => {
      try {
        const gltf = await loader.loadAsync(path);
        const scene = gltf.scene || gltf.scenes[0];
        const animations = gltf.animations || [];
        // Normalize orientation/scale if needed
        scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        return { scene, animations };
      } catch (error) {
        console.error('Error loading model:', path, error);
        throw error;
      }
    };

    (async () => {
      try {
        const [army1Data, army2Data] = await Promise.all([
          loadModel('/models/male_knight.glb'),
          loadModel('/models/skeleton_01.glb')
        ]);
        if (!cancelled) {
          baseModelsRef.current.army1 = army1Data.scene;
          baseModelsRef.current.army2 = army2Data.scene;
          animationsRef.current.army1 = army1Data.animations;
          animationsRef.current.army2 = army2Data.animations;
          setModelsLoaded(true);
        }
      } catch (e) {
        console.error('Model loading failed:', e);
        // If loading fails, keep using instanced cylinders
        if (!cancelled) setModelsLoaded(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);



  // Update controls in animation loop
  useEffect(() => {
    if (!controlsRef.current) return;

    const updateControls = () => {
      controlsRef.current.update();
      requestAnimationFrame(updateControls);
    };
    updateControls();
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: battlefieldWidth,
        height: battlefieldHeight,
        position: 'relative'
      }}
    />
  );
}

export default Battlefield3D;
