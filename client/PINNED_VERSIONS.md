This file documents the pinned dependency versions for the `client` (frontend) package.json.

Top-level dependencies (pinned to exact installed versions):

- @chakra-ui/react: 3.27.1
- @emotion/react: 11.14.0
- @emotion/styled: 11.14.1
- @testing-library/dom: 10.4.1
- @testing-library/jest-dom: 6.9.1
- @testing-library/react: 16.3.0
- @testing-library/user-event: 13.5.0
- axios: 1.12.2
- chart.js: 4.4.0
- chartjs-adapter-date-fns: 3.0.0
- chartjs-plugin-zoom: 2.2.0
- date-fns: 2.30.0
- firebase: 12.4.0
- framer-motion: 12.23.24
- html2canvas: 1.4.1
- lucide-react: 0.545.0
- react: 19.2.0
- react-chartjs-2: 5.3.0
- react-dom: 19.2.0
- react-router-dom: 7.9.4
- react-scripts: 5.0.1
- recharts: 3.2.1
- web-vitals: 2.1.4

Dev dependencies pinned:

- @tailwindcss/postcss: 4.1.14
- autoprefixer: 10.4.21
- postcss: 8.5.6
- tailwindcss: 3.4.18

Notes:
- To update pinned versions safely, run `npm update <pkg>` in the `client` folder and then inspect `package-lock.json` for the installed version. After verifying tests pass, update `client/package.json` to the new exact version.
- Consider running `npm ci` in CI environments to ensure reproducible installs.
