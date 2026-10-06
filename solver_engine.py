"""Pure structural-mechanics math. Units: kN, m, GPa (E), m^4 (I), m^2 (A)."""
import numpy as np
import sympy as sp

def _cumtrapz(y, x):
    out = np.zeros_like(y)
    out[1:] = np.cumsum((y[1:] + y[:-1]) / 2 * np.diff(x))
    return out

# ---------- Beam (simply supported; point loads + full-span UDL) ----------
def solve_beam(L, E, I, point_loads, udl, n=101):
    EI = E * 1e6 * I  # kN.m^2
    x = np.linspace(0, L, n)
    P = sum(p["P"] for p in point_loads)
    RB = (sum(p["P"] * p["a"] for p in point_loads) + udl * L * L / 2) / L
    RA = P + udl * L - RB
    V = RA - udl * x
    M = RA * x - udl * x**2 / 2
    for p in point_loads:
        V = V - np.where(x >= p["a"], p["P"], 0.0)
        M = M - np.where(x > p["a"], p["P"] * (x - p["a"]), 0.0)
    theta = _cumtrapz(M / EI, x)
    y = _cumtrapz(theta, x)
    y = y - y[-1] * x / L  # enforce y(0)=y(L)=0; positive = downward sag
    return dict(x=x.tolist(), shear=V.tolist(), moment=M.tolist(), deflection=y.tolist(),
                reactions=dict(RA=RA, RB=RB), max_moment=float(np.max(np.abs(M))),
                max_deflection=float(np.max(np.abs(y))), EI=EI)

def influence_line(L, section, steps=50):
    """Unit load stepped across 50 intervals; effects at `section` (m)."""
    c = section
    out = []
    for a in np.linspace(0, L, steps + 1):
        RA, RB = 1 - a / L, a / L
        V = RA - (1.0 if a < c else 0.0)
        M = RA * c - (1.0 * (c - a) if a < c else 0.0)
        out.append(dict(position=float(a), RA=RA, RB=RB, shear=V, moment=M))
    return dict(section=c, points=out)

# ---------- 2D Truss: direct stiffness method ----------
def solve_truss(nodes, members, supports, loads, E=200.0, A=0.005):
    """nodes [[x,y]], members [[i,j]], supports {node:[fixX,fixY]}, loads {node:[Fx,Fy]}"""
    nodes = np.array(nodes, float); nn = len(nodes); EA = E * 1e6 * A
    K = np.zeros((2 * nn, 2 * nn)); geo = []
    for i, j in members:
        d = nodes[j] - nodes[i]; Lm = np.hypot(*d); c, s = d / Lm
        k = EA / Lm * np.array([[c*c, c*s, -c*c, -c*s], [c*s, s*s, -c*s, -s*s],
                                [-c*c, -c*s, c*c, c*s], [-c*s, -s*s, c*s, s*s]])
        dof = [2*i, 2*i+1, 2*j, 2*j+1]
        K[np.ix_(dof, dof)] += k; geo.append((dof, Lm, c, s))
    F = np.zeros(2 * nn)
    for k_, v in loads.items(): F[2*int(k_)], F[2*int(k_)+1] = v
    fixed = [2*int(k_)+d for k_, fl in supports.items() for d, f in enumerate(fl) if f]
    free = [d for d in range(2 * nn) if d not in fixed]
    u = np.zeros(2 * nn)
    u[free] = np.linalg.solve(K[np.ix_(free, free)], F[free])
    R = K @ u - F
    res = []
    for (dof, Lm, c, s), m in zip(geo, members):
        N = EA / Lm * (-c*u[dof[0]] - s*u[dof[1]] + c*u[dof[2]] + s*u[dof[3]])
        kind = "Zero-Force" if abs(N) < 1e-6 else ("Tension" if N > 0 else "Compression")
        res.append(dict(member=list(map(int, m)), axial=float(N), type=kind))
    return dict(displacements=u.reshape(-1, 2).tolist(),
                reactions={str(k_): [float(R[2*int(k_)]), float(R[2*int(k_)+1])] for k_ in supports},
                members=res)

# ---------- Column buckling ----------
K_FACTORS = {"Pinned-Pinned": 1.0, "Fixed-Free": 2.0, "Fixed-Fixed": 0.5, "Fixed-Pinned": 0.7}

def solve_column(L, E, I, A, ecc, yield_stress=250.0, c=None):
    """E GPa, I m^4, A m^2, ecc m, yield MPa. Secant formula per boundary condition."""
    r = np.sqrt(I / A); c = c or np.sqrt(A) / 2; EA = E * 1e6 * A  # kN
    out = {}
    for name, K in K_FACTORS.items():
        Pcr = np.pi**2 * E * 1e6 * I / (K * L)**2
        P = np.linspace(0, 0.98 * Pcr, 60)
        ang = K * L / (2 * r) * np.sqrt(P / EA)
        sig = P / A / 1e3 * (1 + ecc * c / r**2 / np.cos(ang))  # MPa
        out[name] = dict(K=K, Pcr=float(Pcr), slenderness=float(K * L / r), P=P.tolist(),
                         stress_MPa=sig.tolist(),
                         P_yield=float(P[np.argmax(sig >= yield_stress)] if np.any(sig >= yield_stress) else Pcr))
    return out

# ---------- Deflection lab (SS beam, UDL w) ----------
def deflection_lab(L, E, I, w):
    x = sp.symbols("x"); EI = sp.symbols("EI", positive=True)
    c1, c2, c3, c4 = sp.symbols("c1:5")
    y = sp.integrate(sp.integrate(sp.integrate(sp.integrate(sp.Integer(w), x) , x), x), x) / EI + c1*x**3/6 + c2*x**2/2 + c3*x + c4
    sol = sp.solve([y.subs(x, 0), y.subs(x, L), sp.diff(y, x, 2).subs(x, 0), sp.diff(y, x, 2).subs(x, L)], [c1, c2, c3, c4])
    y = sp.simplify(y.subs(sol)); ev = float(E * 1e6 * I)
    f = sp.lambdify(x, y.subs(EI, ev), "numpy"); xs = np.linspace(0, L, 51)
    ymax = 5 * w * L**4 / (384 * ev); thmax = w * L**3 / (24 * ev)
    return dict(ode="EI d4y/dx4 = w", solution=str(y), x=xs.tolist(),
                direct=np.asarray(f(xs), float).tolist() if True else [],
                moment_area=dict(theta_A=thmax, delta_max=ymax, note="delta = (2/3)(L/2)(wL^2/8EI)(5L/16) = 5wL^4/384EI"),
                conjugate=dict(load="M/EI diagram as distributed load on conjugate SS beam", theta_A=thmax, delta_max=ymax))
