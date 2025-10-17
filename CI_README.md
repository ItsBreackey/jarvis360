This repository includes a GitHub Actions workflow at `.github/workflows/ci.yml` which runs:

- Backend: Django tests via `python manage.py test` (Python 3.11)
- Frontend: `npm test` inside the `client` directory (Node 18)

If you add or change dependencies, update `requirements.txt` or `client/package.json` accordingly.

Notes:
- The client folder includes a `.env.example` — copy it to `client/.env` and fill any runtime values (e.g., Firebase) if you use those features locally.
- CSV inputs should include a date-like column and an MRR (amount) column. The parser normalizes common date formats to `YYYY-MM-DD` when possible.
