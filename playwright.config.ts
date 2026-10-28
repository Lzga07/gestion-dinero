import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  reporter: 'list',
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173/gestion-dinero/',
    timezoneId: 'America/Argentina/Buenos_Aires',
    locale: 'es-AR',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173',
    url: 'http://localhost:4173/gestion-dinero/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    { name: 'android', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
  ],
})
