# Jarvis360

This repository contains Jarvis360: a local-first SaaS analytics sandbox (React frontend + optional Django backend).

Full system documentation is in `docs/System_Documentation.md` — please read that file for run instructions, architecture details, and developer notes.

Quick start

- Frontend (development):
  - `npm --prefix ./client install`
  - `npm --prefix ./client start`

- Backend (optional):
  - Create and activate a Python virtualenv, then `pip install -r requirements.txt` and run `python manage.py runserver`.

Testing

- Frontend: `npm --prefix ./client test -- --watchAll=false`
- Backend: `python manage.py test`

CI

See `.github/workflows/ci.yml` — CI runs backend tests and frontend tests on push/PR.

---

For more details, open `docs/System_Documentation.md`.
