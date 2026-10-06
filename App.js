import React, { useEffect, useMemo, useRef, useState } from "react";
import Sidebar, { MODULES } from "./components/Sidebar";
import LineChart from "./components/LineChart";
import TrussView from "./components/TrussView";
import StructuralViewport from "./engine/StructuralViewport";
import { solveBeam, influenceLine, solveTruss, TRUSSES, solveColumn, deflectionLab } from "./engine/solver";

const n = (v) => (Number.isFinite(+v) ? +v : 0);
const f = (x, k = 2) => (+x).toFixed(k);
const xy = (X, Y) => X.map((x, i) => ({ x, y: Y[i] }));
const C = ["#38bdf8", "#f87171", "#facc15", "#4ade80"];

function Field({ label, value, onChange }) {
  return (<label className="block text-xs text-slate-400 mb-2">{label}
    <input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 text-sm" /></label>);
}

export default function App() {
  const [open, setOpen] = useState(true), [active, setActive] = useState("beam");
  const [p, setP] = useState({ L: 6, E: 200, I: 8e-5, P: 50, a: 3, udl: 10, c: 3, truss: "Warren truss", A: 0.005, colL: 4, colI: 8e-6, colA: 0.004, ecc: 0.01 });
  const [scale, setScale] = useState(20), [heat, setHeat] = useState(true);
  const host = useRef(), vp = useRef();
  const set = (k) => (v) => setP((o) => ({ ...o, [k]: v }));
  const L = Math.max(n(p.L), 0.5), a = Math.min(Math.max(n(p.a), 0), L), Pl = n(p.P);

  const beam = useMemo(() => solveBeam({ L, E: n(p.E), I: n(p.I), P: Pl, a, udl: n(p.udl) }), [L, p.E, p.I, Pl, a, p.udl]);
  const infl = useMemo(() => influenceLine(L, Math.min(n(p.c), L)), [L, p.c]);
  const geom = TRUSSES[p.truss];
  const truss = useMemo(() => solveTruss(geom, Pl, n(p.E), n(p.A)), [geom, Pl, p.E, p.A]);
  const col = useMemo(() => solveColumn({ L: n(p.colL) || 1, E: n(p.E), I: n(p.colI), A: n(p.colA), ecc: n(p.ecc) }), [p.colL, p.E, p.colI, p.colA, p.ecc]);
  const dl = useMemo(() => deflectionLab({ L, E: n(p.E), I: n(p.I), w: n(p.udl) }), [L, p.E, p.I, p.udl]);

  useEffect(() => { vp.current = new StructuralViewport(host.current); return () => vp.current.dispose(); }, []);
  useEffect(() => { vp.current.build({ L, point_loads: Pl ? [{ a, P: Pl }] : [], udl: n(p.udl) }, beam); }, [beam]); // eslint-disable-line
  useEffect(() => vp.current.setScale(scale), [scale]);
  useEffect(() => vp.current.setHeat(heat), [heat]);

  const steps = {
    beam: [`ΣM_B = 0 → R_A = ${f(beam.reactions.RA)} kN, R_B = ${f(beam.reactions.RB)} kN`, "V(x) = R_A − wx − P⟨x−a⟩⁰", `M(x) = R_A·x − wx²/2 − P⟨x−a⟩¹ → M_max = ${f(beam.max_moment)} kN·m`, `EI·y″ = M(x), EI = ${f(beam.EI, 0)} kN·m²; integrate twice, y(0)=y(L)=0`, `δ_max = ${f(beam.max_deflection * 1000)} mm`],
    influence: ["R_A = 1 − a/L", "V_c = R_A − ⟨a<c⟩", "M_c = R_A·c − (c−a)⟨a<c⟩", "Step the unit load across 50 intervals; the ordinate at each step is the effect at section c."],
    truss: ["Member stiffness k = (EA/L)·[c² cs −c² −cs; …] in global axes", "Assemble K; partition free/fixed DOF: K_ff·u_f = F_f", "N = (EA/L)(−c·u_i − s·v_i + c·u_j + s·v_j)", "N > 0 tension, N < 0 compression, N ≈ 0 zero-force"],
    column: ["Euler: P_cr = π²EI/(KL)², K = 1, 2, 0.5, 0.7", `Pinned-Pinned: P_cr = ${f(col["Pinned-Pinned"].Pcr, 0)} kN, KL/r = ${f(col["Pinned-Pinned"].slenderness, 0)}`, "Secant: σ_max = (P/A)[1 + (ec/r²)·sec((KL/2r)·√(P/EA))]"],
    deflection: ["Governing ODE: EI·y⁗ = w", "Double integration: y = wx(L³ − 2Lx² + x³)/(24EI)", `Moment-area: δ_max = 5wL⁴/384EI = ${f(dl.delta_max * 1000)} mm, θ_A = wL³/24EI = ${f(dl.theta_A * 1000, 3)} mrad`, "Conjugate beam: load = M/EI; conjugate shear = slope, conjugate moment = deflection"],
  }[active];

  return (
    <div className="h-screen flex bg-slate-950 text-slate-100">
      <Sidebar open={open} setOpen={setOpen} active={active} setActive={setActive} />
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] min-w-0">
        <section className="p-4 border-r border-slate-800 overflow-y-auto">
          <h1 className="text-lg font-semibold mb-4">{MODULES.find((m) => m.id === active).label}</h1>
          {active !== "column" && active !== "truss" && <Field label="Span L (m)" value={p.L} onChange={set("L")} />}
          <Field label="E (GPa)" value={p.E} onChange={set("E")} />
          {(active === "beam" || active === "deflection") && <Field label="I (m⁴)" value={p.I} onChange={set("I")} />}
          {(active === "beam" || active === "truss") && <Field label={active === "beam" ? "Point load P (kN)" : "Applied load (kN, down)"} value={p.P} onChange={set("P")} />}
          {active === "beam" && <label className="block text-xs text-slate-400 mb-2">Load position a: {f(a)} m<input type="range" min="0" max={L} step="0.05" value={a} onChange={(e) => set("a")(e.target.value)} className="w-full" /></label>}
          {(active === "beam" || active === "deflection") && <Field label="UDL w (kN/m)" value={p.udl} onChange={set("udl")} />}
          {active === "influence" && <Field label="Section c (m)" value={p.c} onChange={set("c")} />}
          {active === "truss" && <><label className="block text-xs text-slate-400 mb-2">Structure<select value={p.truss} onChange={(e) => set("truss")(e.target.value)} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm">{Object.keys(TRUSSES).map((k) => <option key={k}>{k}</option>)}</select></label><Field label="Area A (m²)" value={p.A} onChange={set("A")} /></>}
          {active === "column" && <><Field label="Length (m)" value={p.colL} onChange={set("colL")} /><Field label="I (m⁴)" value={p.colI} onChange={set("colI")} /><Field label="A (m²)" value={p.colA} onChange={set("colA")} /><Field label="Eccentricity e (m)" value={p.ecc} onChange={set("ecc")} /></>}
          {(active === "beam" || active === "truss") && <label className="block mt-3 text-xs text-slate-400">Deformation scale: {scale}×<input type="range" min="1" max="100" value={scale} onChange={(e) => setScale(+e.target.value)} className="w-full" /></label>}
          {active === "beam" && <label className="flex items-center gap-2 mt-3 text-sm"><input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} />Stress heatmap</label>}
        </section>

        <section className="relative min-h-[360px]">
          <div ref={host} className="absolute inset-0" />
          {active === "beam" && <div className="absolute bottom-0 inset-x-0 h-44 bg-slate-950/80 grid grid-cols-2 gap-2 p-2">
            <LineChart xTitle="x (m)" yTitle="V (kN)" datasets={[{ label: "Shear", color: C[0], data: xy(beam.x, beam.shear) }]} />
            <LineChart xTitle="x (m)" yTitle="M (kN·m)" flipY datasets={[{ label: "Moment (plotted on tension side)", color: C[1], data: xy(beam.x, beam.moment) }]} /></div>}
          {active !== "beam" && <div className="absolute inset-0 bg-slate-950 p-4 overflow-auto">
            {active === "influence" && <div className="h-[60vh]"><LineChart xTitle="Unit load position a (m)" yTitle="Effect" datasets={[{ label: "V at c", color: C[0], data: infl.map((q) => ({ x: q.a, y: q.V })) }, { label: "M at c", color: C[1], data: infl.map((q) => ({ x: q.a, y: q.M })) }, { label: "R_A", color: C[3], data: infl.map((q) => ({ x: q.a, y: q.RA })) }]} /></div>}
            {active === "truss" && <><TrussView geom={geom} result={truss} scale={scale} />
              <table className="mt-3 text-sm text-slate-300"><tbody>{truss.members.map((m, i) => <tr key={i}><td className="pr-4">Member {m.member[0]}–{m.member[1]}</td><td className="pr-4">{f(m.N)} kN</td><td>{m.type}</td></tr>)}</tbody></table></>}
            {active === "column" && <><div className="h-[55vh]"><LineChart xTitle="Max stress σ (MPa)" yTitle="Axial load P (kN)" datasets={Object.entries(col).map(([k, v], i) => ({ label: `${k} (K=${v.K})`, color: C[i], data: v.pts }))} /></div>
              <table className="mt-3 text-sm text-slate-300"><tbody>{Object.entries(col).map(([k, v]) => <tr key={k}><td className="pr-4">{k}</td><td className="pr-4">P_cr = {f(v.Pcr, 0)} kN</td><td>KL/r = {f(v.slenderness, 0)}</td></tr>)}</tbody></table></>}
            {active === "deflection" && <><div className="h-[55vh]"><LineChart xTitle="x (m)" yTitle="Deflection (m, down)" flipY datasets={[{ label: "Numerical (∬M/EI)", color: C[0], data: xy(dl.x, dl.numeric) }, { label: "Analytic (ODE)", color: C[2], borderDash: [6, 4], data: xy(dl.x, dl.analytic) }]} /></div>
              <p className="mt-3 text-sm text-slate-300">Moment-area and conjugate-beam give δ_max = {f(dl.delta_max * 1000)} mm; numerical peak = {f(Math.max(...dl.numeric) * 1000)} mm.</p></>}
          </div>}
        </section>

        <section className="p-4 border-l border-slate-800 overflow-y-auto">
          <h2 className="text-sm font-semibold mb-3 text-cyan-300">Step-by-step derivation</h2>
          <ol className="space-y-2 text-sm text-slate-300">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </section>
      </main>
    </div>
  );
}
