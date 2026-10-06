import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import solver_engine as se

app = Flask(__name__)
origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
CORS(app, resources={r"/api/*": {"origins": origins}})

def _run(fn):
    try:
        return jsonify(fn(request.get_json(force=True)))
    except Exception as e:
        return jsonify(error=str(e)), 400

@app.get("/api/health")
def health(): return jsonify(status="ok")

@app.post("/api/solve-beam")
def beam(): return _run(lambda d: se.solve_beam(d["L"], d.get("E", 200), d.get("I", 8e-5), d.get("point_loads", []), d.get("udl", 0)))

@app.post("/api/influence-line")
def infl(): return _run(lambda d: se.influence_line(d["L"], d["section"]))

@app.post("/api/solve-truss")
def truss(): return _run(lambda d: se.solve_truss(d["nodes"], d["members"], d["supports"], d["loads"], d.get("E", 200), d.get("A", 0.005)))

@app.post("/api/solve-column")
def column(): return _run(lambda d: se.solve_column(d["L"], d.get("E", 200), d["I"], d["A"], d.get("ecc", 0.01), d.get("yield", 250)))

@app.post("/api/deflection-lab")
def defl(): return _run(lambda d: se.deflection_lab(d["L"], d.get("E", 200), d.get("I", 8e-5), d.get("w", 10)))

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
