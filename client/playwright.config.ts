import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e/tests',
	timeout: 180000,
	expect: { timeout: 10000 },
	reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
	use: {
		headless: true,
		actionTimeout: 30000,
		trace: 'on-first-retry',
		video: 'retain-on-failure'
	},
	webServer: {
		command: 'npx serve -s build -l 3000',
		port: 3000,
		reuseExistingServer: true,
		timeout: 120000,
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
});
