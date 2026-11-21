// Shared helpers: per-app URLs, API shortcuts, and a guard that fails a test on console errors or 5xx responses.
import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

export const APP = { user: 'http://localhost:5173', host: 'http://localhost:5174', admin: 'http://localhost:5175' };
export const ADMIN = { email: 'admin@milojulo.app', password: 'admin-pass-123' };
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Create an account through an app's API (the dev proxy stamps the app). Returns { email, password, user }. */
export async function apiSignup(request, app, over = {}) {
  const email = over.email || `qa+${app}${uniq()}@example.com`;
  const password = over.password || 'qa-pass-12345';
  const r = await request.post(`${APP[app]}/api/auth/register`, { data: { name: over.name || `QA ${app} ${uniq().slice(0, 4)}`, email, password, birthDate: '1994-06-15', acceptTerms: true, languages: 'Hindi,English' } });
  const body = await r.json();
  if (!r.ok()) throw new Error(`signup ${app}: ${body.error}`);
  return { email, password, user: body.user };
}

/** Sign a browser context in through the app's API so its session cookie is set. */
export async function apiLogin(context, app, { email, password }) {
  const r = await context.request.post(`${APP[app]}/api/auth/login`, { data: { email, password } });
  expect(r.ok(), `login ${email} on ${app}`).toBeTruthy();
  return (await r.json()).user;
}

/** An admin request context (creates the admin on first run; ADMIN_EMAILS in worker/.dev.vars). */
export async function adminApi(playwright) {
  const ctx = await playwright.request.newContext({ baseURL: APP.admin });
  let r = await ctx.post('/api/auth/login', { data: ADMIN });
  if (!r.ok()) r = await ctx.post('/api/auth/register', { data: { ...ADMIN, name: 'QA Admin', birthDate: '1990-01-01', acceptTerms: true } });
  expect(r.ok(), 'admin login').toBeTruthy();
  return ctx;
}

/** A host that is approved and ready to go online. */
export async function approvedHost(request, admin, name) {
  const h = await apiSignup(request, 'host', { name });
  const r = await admin.patch(`/api/admin/hosts/${h.user.id}`, { data: { approved: true } });
  expect(r.ok()).toBeTruthy();
  return h;
}

const A11Y_LOG = 'e2e/a11y-findings.json';
/** axe scan: fails on critical issues, records serious ones for the bug report. */
export async function a11y(page, screen) {
  // let entry animations (fade/rise) finish first, otherwise text mid-fade reads as low contrast
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
    .map((a) => a.finished.catch(() => {}))));
  await page.waitForTimeout(700); // staggered entry animations start after a short delay
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const bad = res.violations.filter((v) => ['critical', 'serious'].includes(v.impact));
  const log = fs.existsSync(A11Y_LOG) ? JSON.parse(fs.readFileSync(A11Y_LOG, 'utf8')) : {};
  log[screen] = bad.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  fs.writeFileSync(A11Y_LOG, JSON.stringify(log, null, 2));
  expect(res.violations.filter((v) => v.impact === 'critical').map((v) => `${v.id}: ${v.help}`), `critical a11y issues on ${screen}`).toEqual([]);
}

/** Watches a page: collects console errors (except expected 4xx resource loads) and any 5xx response. */
export function guard(page) {
  const problems = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource: the server responded with a status of 4\d\d/.test(t)) return; // expected 401/403/404 handled by the app
    if (/WebSocket connection to .* failed/.test(t)) return; // reconnect noise during dev HMR
    problems.push(`console: ${t.slice(0, 200)}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  return problems;
}

const watched = [];
/** Open a second (or third) person in their own browser context, guarded the same way. */
export async function personPage(browser, base) {
  const context = await browser.newContext({ ...base, permissions: ['camera', 'microphone'] });
  const page = await context.newPage();
  watched.push(guard(page));
  return { context, page };
}

export const test = base.extend({
  // every test's pages are guarded; any console error or 5xx fails the test at the end
  problems: [async ({ context }, use) => {
    watched.length = 0;
    context.on('page', (p) => watched.push(guard(p)));
    for (const p of context.pages()) watched.push(guard(p));
    await use(watched);
    expect(watched.flat(), 'console errors / 5xx during test').toEqual([]);
  }, { auto: true }],
});
export { expect };
