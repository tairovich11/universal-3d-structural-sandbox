# Universal 3D Structural Mechanics Sandbox & Solver

React + Three.js frontend, Flask + NumPy/SymPy backend.

## Run locally
```
cd backend && pip install -r requirements.txt && python app.py      # :5000
cd frontend && npm install && npm start                              # :3000
```
Set `REACT_APP_API_URL` (frontend) and `ALLOWED_ORIGINS` (backend, comma-separated) for deployment.

## Syllabus mapping
| Module | Weeks | Endpoint |
|---|---|---|
| Beams | 2, 3, 6, 7 | `/api/solve-beam` |
| Influence lines | 6, 7 | `/api/influence-line` |
| 2D trusses | 4, 5 | `/api/solve-truss` |
| Column buckling | 10, 11 | `/api/solve-column` |
| Deflection lab | 12-15 | `/api/deflection-lab` |

Units: kN, m, GPa, m⁴, m².

## Deploy on GitHub Pages (no server needed)
The frontend contains a JavaScript port of the solver (`frontend/src/engine/solver.js`), so the full site works on GitHub Pages alone.
1. Push this repo to GitHub (branch `main`).
2. Settings → Pages → Source: **GitHub Actions**.
3. The included workflow `.github/workflows/deploy.yml` builds and publishes on every push.

The Flask backend in `backend/` is optional (same math, REST API).

## Optional backend deploy
- Backend (Render/Railway): root `backend`, build `pip install -r requirements.txt`, start `gunicorn app:app`, env `ALLOWED_ORIGINS=https://<your-frontend>`.
- Frontend (Vercel): root `frontend`, build `npm run build`, env `REACT_APP_API_URL=https://<your-backend>`. For GitHub Pages set `homepage` in `package.json` and publish `build/`.
