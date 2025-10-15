This repository includes a GitHub Actions workflow at `.github/workflows/ci.yml` which runs:

- Backend: Django tests via `python manage.py test` (Python 3.11)
- Frontend: `npm test` inside the `client` directory (Node 18)

If you add or change dependencies, update `requirements.txt` or `client/package.json` accordingly.
