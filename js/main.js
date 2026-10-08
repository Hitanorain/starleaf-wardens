'use strict';
// 入口：渲染器、镜头、灯光与主循环
(function () {
  const CFG = G.CFG, Wd = G.World, S = G.S;

  const renderer = G.renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('app').prepend(renderer.domElement);

  const scene = G.scene = new THREE.Scene();
  scene.fog = new THREE.Fog(G.M.lin(0xc9c2ee), 30, 62);
  const camera = G.camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 200);
  G.cam = { target: new THREE.Vector3(0, 0, 0.6), dist: 23, pitch: 0.98, yaw: 0, shake: 0 };

  // 线性空间光照（最终由后处理做 ACES 色调映射）
  const hemi = new THREE.HemisphereLight(G.M.lin(0xd6e2ff), G.M.lin(0x7a6450), 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(G.M.lin(0xffe0b8), 1.5);
  sun.position.set(-9, 16, 8);
  scene.add(sun.target);   // 阴影跟着镜头走，大地图也能保持阴影清晰
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -16; sc.right = 16; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 50;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(G.M.lin(0xb59cff), 0.3);
  rim.position.set(10, 6, -10);
  scene.add(rim);

  // ---------- 后处理：泛光 + 调色（色调映射、伽马、饱和度、暗角） ----------
  const composer = new THREE.EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new THREE.RenderPass(scene, camera));
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.4, 1.0);
  composer.addPass(bloom);
  const grade = new THREE.ShaderPass({
    uniforms: { tDiffuse: { value: null }, exposure: { value: 1.0 }, saturation: { value: 1.0 }, contrast: { value: 1.08 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float exposure, saturation, contrast; varying vec2 vUv;
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb * exposure;
        c = aces(c);
        c = pow(c, vec3(1.0/2.2));
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, saturation);
        c = (c - 0.5) * contrast + 0.5;
        c += vec3(0.025, 0.012, -0.02) * l;            // 高光偏暖
        c += vec3(-0.01, 0.0, 0.03) * (1.0 - l);       // 暗部偏冷
        vec2 d = (vUv - 0.5) * vec2(1.0, 1.2);
        c *= mix(0.6, 1.0, smoothstep(0.85, 0.3, length(d)));   // 暗角
        c *= mix(0.86, 1.0, smoothstep(1.0, 0.65, vUv.y));      // 顶部压暗
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
  });
  composer.addPass(grade);
  G.composer = composer;

  // 生物群系：天空、雾、灯光
  G.applyBiome = function (b) {
    G.biome = b;
    const B = G.BIOMES[b];
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    B.sky.forEach((col, i) => g.addColorStop([0, 0.45, 0.75, 1][i], col));
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    if (scene.background) scene.background.dispose();
    scene.background = t;
    scene.fog.color.copy(G.M.lin(B.fog));
    sun.color.copy(G.M.lin(B.sun[0])); sun.intensity = B.sun[1];
    hemi.color.copy(G.M.lin(B.hemi[0])); hemi.groundColor.copy(G.M.lin(B.hemi[1])); hemi.intensity = B.hemi[2];
    G.Terrain.setBiome(b);
  };

  // 让已开拓的区域刚好放进屏幕的镜头距离
  G.fitDist = () => {
    const t = Math.tan(camera.fov * Math.PI / 360);
    const b = Wd.bounds ? Wd.bounds() : { w: CFG.W, h: CFG.H };
    return Math.max(14, Math.min(46, Math.max((b.w / 2 + 1.2) / (t * camera.aspect), (b.h / 2 + 0.8) / t)));
  };
  // 镜头平滑移动到已开拓区域中心
  G.camFit = function () {
    const b = Wd.bounds();
    G.cam.goal = { x: b.cx, z: b.cz + 0.4, dist: G.fitDist() };
  };

  G.FX.init(scene);
  G.shake = a => { G.cam.shake = Math.max(G.cam.shake, a); };

  G.newMap = function (seed, biome) {
    G.applyBiome(biome || G.biome || 'forest');
    G.newState();
    Wd.gen(seed);
    Wd.build(scene);
    Wd.recompute();
    G.FX.clear();
    G.FX.clearTexts();
    G.Hero.init();
    S.phase = 'title';
    const b = Wd.bounds();
    G.cam.target.set(b.cx, 0, b.cz); G.cam.dist = G.fitDist(); G.cam.goal = null;
    if (G.UI.ring) G.UI.setTool(null);
  };
  G.beginRun = function () {
    document.getElementById('screen-title').hidden = true;
    S.phase = 'prep';
    G.cam.yaw = 0; G.camFit();
    G.startRun();
    G.UI.refresh();
    G.UI.banner('备战阶段', '用下方的地形块搭出高地、拉长敌人路线，再在高地上建塔。准备好后按 空格 开战');
    setTimeout(() => { if (S.wave === 0) G.UI.toast('提示：右键点击地图可以让露娜飞过去', ''); }, 4500);
  };

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloom.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  G.UI.seed = Math.floor(Math.random() * 99999);
  G.newMap(G.UI.seed, 'forest');
  G.UI.init();
  document.getElementById('seed').textContent = G.UI.seed;

  let last = performance.now(), time = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    const live = ['prep', 'combat', 'blessing'].includes(S.phase);
    const gdt = S.paused ? 0 : dt * (S.phase === 'combat' ? S.speed : 1);
    if (live && gdt > 0) G.update(gdt);
    Wd.update(dt, time);
    G.FX.update(gdt || (S.phase === 'title' ? dt : 0));
    Wd.updateDots(time, S.phase !== 'combat');
    G.UI.frame(dt);

    const c = G.cam;
    if (S.phase === 'title') c.yaw = Math.sin(time * 0.15) * 0.35;
    if (c.goal) {
      const k = Math.min(1, dt * 3);
      c.target.x += (c.goal.x - c.target.x) * k; c.target.z += (c.goal.z - c.target.z) * k;
      c.dist += (c.goal.dist - c.dist) * k;
      if (Math.abs(c.goal.dist - c.dist) < 0.05 && Math.abs(c.goal.x - c.target.x) < 0.05) c.goal = null;
    }
    sun.target.position.set(c.target.x, 0, c.target.z);
    sun.position.set(c.target.x - 9, 16, c.target.z + 8);
    sc.left = sc.bottom = -Math.max(16, c.dist * 0.75); sc.right = sc.top = Math.max(16, c.dist * 0.75); sc.updateProjectionMatrix();
    const cp = Math.cos(c.pitch);
    camera.position.set(
      c.target.x + Math.sin(c.yaw) * c.dist * cp,
      c.target.y + c.dist * Math.sin(c.pitch),
      c.target.z + Math.cos(c.yaw) * c.dist * cp);
    if (c.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * c.shake;
      camera.position.y += (Math.random() - 0.5) * c.shake;
      c.shake = Math.max(0, c.shake - dt * 1.5);
    }
    camera.lookAt(c.target);
    scene.fog.near = c.dist + 6; scene.fog.far = c.dist + 45;   // 雾只笼罩远处，不影响地图本身
    composer.render();
  }
  requestAnimationFrame(loop);
})();
