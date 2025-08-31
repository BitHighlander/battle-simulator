import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
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

  // Helper function to find animation by name
  const findAnimation = (animations, name) => {
    return animations.find(clip => clip.name === name);
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

      // Camera
      const newCamera = new THREE.PerspectiveCamera(
        75,
        battlefieldWidth / battlefieldHeight,
        0.1,
        2000
      );

      // Camera positioning using 1:1 world units (pixels to units)
      const maxDim = Math.max(battlefieldWidth, battlefieldHeight);
      newCamera.position.set(0, maxDim * 0.8, maxDim * 1.2);
      newCamera.lookAt(0, 0, 0);
      console.log('Camera positioned at:', newCamera.position, 'looking at:', new THREE.Vector3(0, 0, 0));
      console.log('Ground plane size:', battlefieldWidth * 3, 'x', battlefieldHeight * 3);

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
      directionalLight.shadow.camera.far = maxDim * 2;
      directionalLight.shadow.camera.left = -battlefieldWidth / 2;
      directionalLight.shadow.camera.right = battlefieldWidth / 2;
      directionalLight.shadow.camera.top = battlefieldHeight / 2;
      directionalLight.shadow.camera.bottom = -battlefieldHeight / 2;
      newScene.add(directionalLight);

      // Ground plane (larger than battlefield dimensions)
      const groundScale = 3; // Make ground 3x larger than battlefield
      const groundGeometry = new THREE.PlaneGeometry(battlefieldWidth * groundScale, battlefieldHeight * groundScale);
      const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x4a5d23 });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      newScene.add(ground);

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
        // TEMPORARILY DISABLE MIXER UPDATES
        /*
        // Advance any active mixers when using GLTFs
        const delta = clockRef.current.getDelta();
        soldierObjectsRef.current.forEach((entry) => {
          if (entry.mixer) entry.mixer.update(delta);
        });
        */
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

    console.log('Rendering soldiers:', soldiers.length, 'modelsLoaded:', modelsLoaded);

    // If models are loaded, render them per-soldier; otherwise use instancing fallback
    if (modelsLoaded && baseModelsRef.current.army1 && baseModelsRef.current.army2) {
      // Create/update 3D objects per soldier
      const activeIds = new Set();
      soldiers.forEach((soldier) => {
        if (!soldier.alive) return;
        activeIds.add(soldier.id);
        let entry = soldierObjectsRef.current.get(soldier.id);
        if (!entry) {
          console.log('Creating soldier:', soldier.id, soldier.team);
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
          console.log('Soldier created:', soldier.id, 'meshes:', meshCount, 'scale:', cloned.scale.x, 'added to scene');
          const mixer = new THREE.AnimationMixer(cloned);

          // Set up animation actions
          const actions = {};
          const attackClip = findAnimation(animations, '1H_Melee_Attack_Chop');
          const deathClip = findAnimation(animations, 'Death_A');
          const idleClip = findAnimation(animations, 'Idle');
          const walkClip = findAnimation(animations, 'Walking_A');

          if (attackClip) actions.attack = mixer.clipAction(attackClip);
          if (deathClip) actions.death = mixer.clipAction(deathClip);
          if (idleClip) actions.idle = mixer.clipAction(idleClip);
          if (walkClip) actions.walk = mixer.clipAction(walkClip);

          entry = { object3D: cloned, mixer, actions };
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
      });

        // TEMPORARILY DISABLE ANIMATIONS TO TEST VISIBILITY
        // Play animations based on soldier state
        /*
        let targetAnimation = 'idle';

        if (!soldier.alive && actions.death) {
          targetAnimation = 'death';
        } else if (soldier.state === 'attacking' && actions.attack) {
          targetAnimation = 'attack';
        } else if ((soldier.state === 'moving' || soldier.state === 'retreating') && actions.walk) {
          targetAnimation = 'walk';
        }

        // Stop all animations and play the target one
        Object.keys(actions).forEach(key => {
          if (key !== targetAnimation) {
            actions[key].stop();
          }
        });

        if (actions[targetAnimation] && !actions[targetAnimation].isRunning()) {
          actions[targetAnimation].reset().play();
        }
        */

      // Remove stale soldier objects
      const toRemove = [];
      soldierObjectsRef.current.forEach((entry, id) => {
        if (!activeIds.has(id)) {
          console.log('Removing soldier:', id, 'from scene');
          scene.remove(entry.object3D);
          toRemove.push(id);
        }
      });
      toRemove.forEach((id) => soldierObjectsRef.current.delete(id));

      console.log('Active 3D soldier objects:', soldierObjectsRef.current.size, 'Scene children:', scene.children.length);

      // Debug: Log soldier positions
      const positions = [];
      soldierObjectsRef.current.forEach((entry, id) => {
        positions.push({id, position: entry.object3D.position, visible: entry.object3D.visible});
      });
      console.log('Soldier positions summary:', positions);

      // Hide instanced fallback when models are used
      if (instancedMesh) instancedMesh.count = 0;
      return;
    }

    console.log('Using cylinder fallback');
    if (!instancedMesh || !dummy) return;
    const visibleSoldiers = soldiers.filter(s => s.alive);
    instancedMesh.count = visibleSoldiers.length;
    console.log('Cylinder count:', instancedMesh.count);
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
          loadModel('/models/male_rogue.glb')
        ]);
        if (!cancelled) {
          baseModelsRef.current.army1 = army1Data.scene;
          baseModelsRef.current.army2 = army2Data.scene;
          animationsRef.current.army1 = army1Data.animations;
          animationsRef.current.army2 = army2Data.animations;
          console.log('Models loaded successfully:', army1Data.animations.length, army2Data.animations.length, 'animations');
          setModelsLoaded(true);
          console.log('modelsLoaded set to true');
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
