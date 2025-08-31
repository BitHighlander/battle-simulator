import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function Battlefield3D({ soldiers, battlefieldWidth, battlefieldHeight }) {
  const mountRef = useRef(null);
  const controlsRef = useRef(null);
  const sceneRef = useRef(null);
  const [camera, setCamera] = useState(null);
  const [renderer, setRenderer] = useState(null);
  const [instancedMesh, setInstancedMesh] = useState(null);
  const [dummy, setDummy] = useState(null);


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

      // Ground plane (1:1 with battlefield dimensions)
      const groundGeometry = new THREE.PlaneGeometry(battlefieldWidth, battlefieldHeight);
      const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x4a5d23 });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      newScene.add(ground);

      // Create dummy soldier geometry for instancing (cylinder) - larger size
      const soldierHeight = 20;
      const soldierRadius = 8;
      const soldierGeometry = new THREE.CylinderGeometry(soldierRadius, soldierRadius, soldierHeight, 12);
      const soldierMaterial = new THREE.MeshLambertMaterial();

      const newDummy = new THREE.Mesh(soldierGeometry, soldierMaterial);
      setDummy(newDummy);

      // Create direction indicator (small cone/arrow)
      const arrowGeometry = new THREE.ConeGeometry(3, 10, 12);
      const arrowMaterial = new THREE.MeshLambertMaterial({ color: 0xffff00 }); // Yellow arrow
      const arrowMesh = new THREE.Mesh(arrowGeometry, arrowMaterial);
      arrowMesh.position.y = soldierHeight * 0.5 + 2; // On top of cylinder
      arrowMesh.rotation.x = Math.PI / 2; // Point along +Z
      newDummy.add(arrowMesh);

      // Create instanced mesh for soldiers
      const maxSoldiers = 100; // Plenty for 20 soldiers
      const newInstancedMesh = new THREE.InstancedMesh(
        soldierGeometry,
        soldierMaterial,
        maxSoldiers
      );
      newInstancedMesh.castShadow = true;
      newInstancedMesh.receiveShadow = true;
      newInstancedMesh.count = 0; // Start with no visible instances
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
    if (!instancedMesh || !dummy) return;

    // Update soldier instances (1:1 mapping from 2D to 3D)
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
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [camera, renderer, battlefieldWidth, battlefieldHeight]);



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
