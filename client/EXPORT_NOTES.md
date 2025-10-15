Export & Clipboard Notes

- The app uses `html2canvas` to rasterize chart containers for image export and clipboard copy. This captures the full rendered chart container (including non-SVG elements) and is more robust than serializing inner SVGs.
- Clipboard image writes may be blocked on non-secure origins (HTTP) or by some browsers. If clipboard copy fails, use the "Download Image" option instead.
- `html2canvas` attempts to use CORS where possible; remote images in charts may not be rendered unless the remote server allows cross-origin access.

Tests

- Unit tests for core analytics functions are located in `client/src/__tests__` and use the utilities under `client/src/utils/analytics.js`.
- Run tests once (CI mode):

```powershell
cd client
npm test -- --watchAll=false
```

Troubleshooting

- If you see errors about missing packages, run `npm install` inside the `client` folder.
- If exports capture only partial elements, ensure the chart container is visible and not clipped by CSS overflow.
