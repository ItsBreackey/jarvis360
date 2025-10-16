import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e/tests',
	timeout: 120000,
	expect: { timeout: 10000 },
	reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
	use: {
		headless: true,
		actionTimeout: 30000,
		trace: 'on-first-retry',
		video: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
});
