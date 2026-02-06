/**
 * Camera Angle Selector Component
 * 
 * 3D Three.js modal for selecting camera angles from the multi-angle LoRA.
 * Displays 96 camera positions (8 directions × 4 heights × 3 shot sizes)
 * with interactive 3D visualization.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  CameraAngle,
  CAMERA_ANGLES,
  VIEW_DIRECTIONS,
  HEIGHT_ANGLES,
  SHOT_SIZES,
  getAnglePosition,
  getDirectionColor,
} from '../data/cameraAngleData';
import './CameraAngleSelector.css';

// ============================================================================
// Types
// ============================================================================

interface CameraAngleSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (angle: CameraAngle) => void;
  currentAngle: CameraAngle | null;
}

interface FilterState {
  directions: boolean[];
  heights: boolean[];
  sizes: boolean[];
}

// ============================================================================
// Component
// ============================================================================

export function CameraAngleSelector({
  isOpen,
  onClose,
  onSelect,
  currentAngle,
}: CameraAngleSelectorProps) {
  // Refs for Three.js
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const markersRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const animationFrameRef = useRef<number>(0);
  const isInitializedRef = useRef(false);

  // State
  const [selectedAngle, setSelectedAngle] = useState<CameraAngle | null>(currentAngle);
  const [hoveredAngle, setHoveredAngle] = useState<CameraAngle | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    directions: VIEW_DIRECTIONS.map(() => true),
    heights: HEIGHT_ANGLES.map(() => true),
    sizes: SHOT_SIZES.map(() => true),
  });

  // Initialize Three.js scene
  useEffect(() => {
    if (!isOpen || !canvasRef.current || isInitializedRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!container) return;

    console.log('Initializing Three.js scene...');

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 3, 6);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 3;
    controls.maxDistance = 10;
    controls.target.set(0, 1.5, 0);
    controls.enablePan = false;
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // Grid
    const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Center sphere (target point)
    const centerGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const centerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const centerSphere = new THREE.Mesh(centerGeometry, centerMaterial);
    centerSphere.position.set(0, 1, 0);
    scene.add(centerSphere);

    // Height rings
    const ringHeights = [0.3, 1.0, 1.7, 2.4];
    ringHeights.forEach((y) => {
      const ringGeometry = new THREE.RingGeometry(3.5, 3.6, 64);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x444444,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = y;
      scene.add(ring);
    });

    // Camera angle markers
    console.log('Creating markers for', CAMERA_ANGLES.length, 'angles');
    CAMERA_ANGLES.forEach((angle) => {
      const [x, y, z] = getAnglePosition(angle);
      const color = getDirectionColor(angle.direction);

      // Create marker
      const geometry = new THREE.SphereGeometry(0.1, 16, 16);
      const material = new THREE.MeshPhongMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.3,
      });
      const marker = new THREE.Mesh(geometry, material);
      marker.position.set(x, y, z);
      marker.userData = { angle };

      scene.add(marker);
      markersRef.current.set(angle.id, marker);
    });

    console.log('Created', markersRef.current.size, 'markers');

    // Handle resize
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);
    isInitializedRef.current = true;

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    console.log('Three.js scene initialized successfully');

    // Cleanup
    return () => {
      console.log('Cleaning up Three.js scene...');
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameRef.current);
      controls.dispose();
      renderer.dispose();
      markersRef.current.forEach((marker) => {
        marker.geometry.dispose();
        (marker.material as THREE.Material).dispose();
      });
      markersRef.current.clear();
      isInitializedRef.current = false;
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
    };
  }, [isOpen]);

  // Update marker visibility based on filters
  useEffect(() => {
    if (!isInitializedRef.current) return;

    CAMERA_ANGLES.forEach((angle) => {
      const marker = markersRef.current.get(angle.id);
      if (marker) {
        const directionVisible = filters.directions[VIEW_DIRECTIONS.indexOf(angle.direction)];
        const heightVisible = filters.heights[HEIGHT_ANGLES.indexOf(angle.height)];
        const sizeVisible = filters.sizes[SHOT_SIZES.indexOf(angle.size)];
        marker.visible = directionVisible && heightVisible && sizeVisible;
      }
    });
  }, [filters]);

  // Update selection visual
  useEffect(() => {
    if (!isInitializedRef.current) return;

    // Reset all markers
    markersRef.current.forEach((marker) => {
      const material = marker.material as THREE.MeshPhongMaterial;
      material.emissiveIntensity = 0.3;
      marker.scale.set(1, 1, 1);
    });

    // Highlight selected
    if (selectedAngle) {
      const marker = markersRef.current.get(selectedAngle.id);
      if (marker) {
        const material = marker.material as THREE.MeshPhongMaterial;
        material.emissiveIntensity = 1.0;
        marker.scale.set(1.5, 1.5, 1.5);
      }
    }
  }, [selectedAngle]);

  // Handle click on canvas
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (!canvasRef.current || !cameraRef.current || !sceneRef.current || !isInitializedRef.current) {
        console.log('Canvas click ignored - not initialized');
        return;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      console.log('Click at:', mouseRef.current.x, mouseRef.current.y);

      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

      const visibleMarkers: THREE.Mesh[] = [];
      markersRef.current.forEach((marker) => {
        if (marker.visible) visibleMarkers.push(marker);
      });

      console.log('Checking', visibleMarkers.length, 'visible markers');

      const intersects = raycasterRef.current.intersectObjects(visibleMarkers);

      console.log('Intersections:', intersects.length);

      if (intersects.length > 0) {
        const marker = intersects[0].object as THREE.Mesh;
        const angle = marker.userData.angle as CameraAngle;
        console.log('Selected angle:', angle.displayName);
        setSelectedAngle(angle);
      }
    },
    []
  );

  // Handle mouse move for hover
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!canvasRef.current || !cameraRef.current || !sceneRef.current || !isInitializedRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

      const visibleMarkers: THREE.Mesh[] = [];
      markersRef.current.forEach((marker) => {
        if (marker.visible) visibleMarkers.push(marker);
      });

      const intersects = raycasterRef.current.intersectObjects(visibleMarkers);

      if (intersects.length > 0) {
        const marker = intersects[0].object as THREE.Mesh;
        const angle = marker.userData.angle as CameraAngle;
        setHoveredAngle(angle);
        canvasRef.current.style.cursor = 'pointer';
      } else {
        setHoveredAngle(null);
        canvasRef.current.style.cursor = 'default';
      }
    },
    []
  );

  // Update filter
  const updateFilter = useCallback(
    (type: 'directions' | 'heights' | 'sizes', index: number, value: boolean) => {
      setFilters((prev) => ({
        ...prev,
        [type]: prev[type].map((v, i) => (i === index ? value : v)),
      }));
    },
    []
  );

  // Toggle all filters of a type
  const toggleAllFilters = useCallback(
    (type: 'directions' | 'heights' | 'sizes', value: boolean) => {
      setFilters((prev) => ({
        ...prev,
        [type]: prev[type].map(() => value),
      }));
    },
    []
  );

  // Confirm selection
  const handleConfirm = useCallback(() => {
    if (selectedAngle) {
      onSelect(selectedAngle);
    }
    onClose();
  }, [selectedAngle, onSelect, onClose]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setSelectedAngle(currentAngle);
    }
  }, [isOpen, currentAngle]);

  if (!isOpen) return null;

  return (
    <div className="camera-angle-overlay" onClick={onClose}>
      <div className="camera-angle-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="camera-angle-header">
          <h2>Select Camera Angle</h2>
          <button className="camera-angle-close" onClick={onClose}>
            ×
          </button>
        </header>

        {/* Content */}
        <div className="camera-angle-content">
          {/* Filters */}
          <aside className="camera-angle-filters">
            {/* Direction filters */}
            <div className="filter-group">
              <div className="filter-group-header">
                <label>View Direction</label>
                <button
                  className="filter-toggle-all"
                  onClick={() =>
                    toggleAllFilters(
                      'directions',
                      !filters.directions.every(Boolean)
                    )
                  }
                >
                  {filters.directions.every(Boolean) ? 'None' : 'All'}
                </button>
              </div>
              <div className="filter-checkboxes">
                {VIEW_DIRECTIONS.map((direction, index) => (
                  <label key={direction} className="filter-checkbox">
                    <input
                      type="checkbox"
                      checked={filters.directions[index]}
                      onChange={(e) =>
                        updateFilter('directions', index, e.target.checked)
                      }
                    />
                    <span className="checkbox-label">
                      {direction.charAt(0).toUpperCase() + direction.slice(1)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Height filters */}
            <div className="filter-group">
              <div className="filter-group-header">
                <label>Height</label>
                <button
                  className="filter-toggle-all"
                  onClick={() =>
                    toggleAllFilters(
                      'heights',
                      !filters.heights.every(Boolean)
                    )
                  }
                >
                  {filters.heights.every(Boolean) ? 'None' : 'All'}
                </button>
              </div>
              <div className="filter-checkboxes">
                {HEIGHT_ANGLES.map((height, index) => (
                  <label key={height} className="filter-checkbox">
                    <input
                      type="checkbox"
                      checked={filters.heights[index]}
                      onChange={(e) =>
                        updateFilter('heights', index, e.target.checked)
                      }
                    />
                    <span className="checkbox-label">
                      {height.charAt(0).toUpperCase() + height.slice(1)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Size filters */}
            <div className="filter-group">
              <div className="filter-group-header">
                <label>Shot Size</label>
                <button
                  className="filter-toggle-all"
                  onClick={() =>
                    toggleAllFilters('sizes', !filters.sizes.every(Boolean))
                  }
                >
                  {filters.sizes.every(Boolean) ? 'None' : 'All'}
                </button>
              </div>
              <div className="filter-checkboxes">
                {SHOT_SIZES.map((size, index) => (
                  <label key={size} className="filter-checkbox">
                    <input
                      type="checkbox"
                      checked={filters.sizes[index]}
                      onChange={(e) =>
                        updateFilter('sizes', index, e.target.checked)
                      }
                    />
                    <span className="checkbox-label">
                      {size.charAt(0).toUpperCase() + size.slice(1)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </aside>

          {/* 3D Canvas */}
          <div className="camera-angle-canvas-container" ref={containerRef}>
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              onMouseMove={handleMouseMove}
            />
            {hoveredAngle && (
              <div className="camera-angle-tooltip">
                {hoveredAngle.displayName}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="camera-angle-footer">
          <div className="camera-angle-selected">
            {selectedAngle ? (
              <>
                <span className="selected-label">Selected:</span>
                <span className="selected-value">
                  {selectedAngle.displayName}
                </span>
                <code className="selected-prompt">{selectedAngle.prompt}</code>
              </>
            ) : (
              <span className="selected-empty">No angle selected</span>
            )}
          </div>
          <div className="camera-angle-actions">
            <button className="camera-angle-btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="camera-angle-btn primary"
              onClick={handleConfirm}
              disabled={!selectedAngle}
            >
              Apply Angle
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default CameraAngleSelector;
