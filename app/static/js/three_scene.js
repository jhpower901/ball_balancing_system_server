// three_scene.js
let bbScene, bbCamera, bbRenderer;
let bbPlatformMesh;
let bbPlatformContainer;
let bbAnimationFrameId = null;

function initPlatformScene() {
  bbPlatformContainer = document.getElementById("platform-container");
  if (!bbPlatformContainer) return;

  const width = bbPlatformContainer.clientWidth;
  const height = bbPlatformContainer.clientHeight || 260;

  // Scene & Camera
  bbScene = new THREE.Scene();
  bbScene.background = new THREE.Color(0xf0f0f0);

  bbCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  bbCamera.position.set(0, 4, 6);
  bbCamera.lookAt(0, 0, 0);

  // Light
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(5, 10, 7);
  bbScene.add(light);

  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  bbScene.add(ambient);

  // Platform
  const geometry = new THREE.BoxGeometry(4, 0.1, 4);
  const material = new THREE.MeshPhongMaterial({ color: 0x2196f3 });
  bbPlatformMesh = new THREE.Mesh(geometry, material);
  bbScene.add(bbPlatformMesh);

  const axesHelper = new THREE.AxesHelper(3);
  bbScene.add(axesHelper);

  // Renderer
  bbRenderer = new THREE.WebGLRenderer({ antialias: true });
  bbRenderer.setSize(width, height);
  bbPlatformContainer.innerHTML = "";
  bbPlatformContainer.appendChild(bbRenderer.domElement);

  const animate = () => {
    bbAnimationFrameId = requestAnimationFrame(animate);
    bbRenderer.render(bbScene, bbCamera);
  };
  animate();
}

function updatePlatformPose(rollDeg, pitchDeg) {
  if (!bbPlatformMesh) return;

  const rollRad = (rollDeg * Math.PI) / 180;
  const pitchRad = (pitchDeg * Math.PI) / 180;

  // X축: pitch, Z축: roll
  bbPlatformMesh.rotation.x = pitchRad;
  bbPlatformMesh.rotation.z = rollRad;
}

// 전역에 노출
window.initPlatformScene = initPlatformScene;
window.updatePlatformPose = updatePlatformPose;
