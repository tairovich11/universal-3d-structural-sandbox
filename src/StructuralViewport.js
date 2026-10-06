import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const N = 101;
const vert = `
uniform float uDef[${N}]; uniform float uStress[${N}]; uniform float uScale; uniform float uL;
varying float vStress; varying vec3 vN; varying vec3 vV;
void main(){
  float f = clamp(position.z / uL, 0.0, 1.0) * ${N - 1}.0;
  int i = int(floor(f)); int j = min(i + 1, ${N - 1}); float t = f - float(i);
  float d = mix(uDef[i], uDef[j], t) * uScale;
  vStress = mix(uStress[i], uStress[j], t);
  vec3 p = position; p.y -= d;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const frag = `
varying float vStress; varying vec3 vN; varying vec3 vV; uniform float uHeat;
vec3 ramp(float s){ // blue/green -> yellow -> deep red
  vec3 a=vec3(0.1,0.35,0.9), b=vec3(0.1,0.8,0.4), c=vec3(1.0,0.9,0.1), d=vec3(0.75,0.02,0.05);
  if(s<0.33) return mix(a,b,s/0.33); if(s<0.66) return mix(b,c,(s-0.33)/0.33); return mix(c,d,(s-0.66)/0.34);}
void main(){
  vec3 n = normalize(vN), v = normalize(vV), l = normalize(vec3(0.5,1.0,0.7));
  float diff = max(dot(n,l),0.0)*0.7+0.25;
  float spec = pow(max(dot(reflect(-l,n),v),0.0),48.0)*0.8;
  float fres = pow(1.0-max(dot(n,v),0.0),3.0)*0.35; // brushed-steel sheen
  vec3 steel = vec3(0.22,0.24,0.27);
  vec3 base = mix(steel, ramp(clamp(vStress,0.0,1.0)), uHeat);
  gl_FragColor = vec4(base*diff + spec + fres, 1.0);
}`;

function iBeamShape(h = 0.3, w = 0.15, tf = 0.02, tw = 0.012) {
  const s = new THREE.Shape(), a = w / 2, b = tw / 2, y = h / 2;
  [[-a, -y], [a, -y], [a, -y + tf], [b, -y + tf], [b, y - tf], [a, y - tf], [a, y], [-a, y], [-a, y - tf], [-b, y - tf], [-b, -y + tf], [-a, -y + tf]]
    .forEach(([px, py], k) => (k ? s.lineTo(px, py) : s.moveTo(px, py)));
  return s;
}
function label(text) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 96;
  const g = c.getContext("2d"); g.fillStyle = "#0f172a"; g.fillRect(0, 0, 256, 96);
  g.fillStyle = "#f8fafc"; g.font = "bold 44px sans-serif"; g.textAlign = "center"; g.fillText(text, 128, 62);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c) }));
  sp.scale.set(0.9, 0.34, 1); return sp;
}

export default class StructuralViewport {
  constructor(el) {
    this.el = el;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x020617);
    this.camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 200);
    this.camera.position.set(4, 3, 9);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(devicePixelRatio); this.renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(5, 10, 6); this.scene.add(dl);
    this.scene.add(new THREE.GridHelper(30, 30, 0x334155, 0x1e293b));
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.u = {
      uDef: { value: new Array(N).fill(0) }, uStress: { value: new Array(N).fill(0) },
      uScale: { value: 1 }, uL: { value: 6 }, uHeat: { value: 1 },
    };
    this.onResize = () => { this.camera.aspect = el.clientWidth / el.clientHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(el.clientWidth, el.clientHeight); };
    window.addEventListener("resize", this.onResize);
    const loop = () => { this.raf = requestAnimationFrame(loop); this.controls.update(); this.renderer.render(this.scene, this.camera); };
    loop();
  }

  /** data = solve-beam response; params = {L, point_loads:[{a,P}], udl} */
  build(params, data) {
    this.group.clear();
    const { L, point_loads = [], udl = 0 } = params;
    this.u.uL.value = L;
    const geo = new THREE.ExtrudeGeometry(iBeamShape(), { depth: L, steps: 100, bevelEnabled: false });
    const mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: vert, fragmentShader: frag });
    const beam = new THREE.Mesh(geo, mat); beam.rotation.y = -Math.PI / 2; beam.position.set(L / 2, 1, 0);
    // after rotation local z -> world -x ... mirror so local z=0 is the left support
    beam.rotation.y = Math.PI / 2; beam.position.set(-L / 2, 1, 0);
    this.group.add(beam);
    const conc = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.95 });
    [-L / 2, L / 2].forEach((px) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.6), conc); b.position.set(px, 0.425, 0); this.group.add(b); });
    point_loads.forEach((p) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 32), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.3 }));
      m.position.set(-L / 2 + p.a, 1.15 + 0.25 + 0.01, 0); this.group.add(m);
      const t = label(`${p.P} kN`); t.position.set(m.position.x, 2.1, 0); this.group.add(t);
    });
    if (udl > 0) { // stacked bricks, one row per metre
      const bm = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.9 });
      for (let k = 0; k < Math.floor(L * 2); k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.15 + Math.min(udl, 40) / 100, 0.3), bm); b.position.set(-L / 2 + 0.25 + k * 0.5, 1.15 + 0.1, 0); this.group.add(b); }
      const t = label(`${udl} kN/m`); t.position.set(0, 2.1, 0); this.group.add(t);
    }
    this.update(data);
  }

  update(data) {
    const pad = (a) => { const r = []; for (let i = 0; i < N; i++) r.push(a[Math.round(i * (a.length - 1) / (N - 1))]); return r; };
    const mx = Math.max(...data.moment.map(Math.abs), 1e-9);
    this.u.uDef.value = pad(data.deflection);
    this.u.uStress.value = pad(data.moment.map((m) => Math.abs(m) / mx));
  }
  setScale(s) { this.u.uScale.value = s; }
  setHeat(on) { this.u.uHeat.value = on ? 1 : 0; }
  dispose() { cancelAnimationFrame(this.raf); window.removeEventListener("resize", this.onResize); this.renderer.dispose(); this.el.removeChild(this.renderer.domElement); }
}
