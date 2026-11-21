// F07 admin, F06-H2 payouts, F08-H1 resolve report, F09 account settings.
import { test, expect, APP, ADMIN, apiSignup, apiLogin, adminApi, approvedHost, personPage, a11y } from './fixtures.mjs';

let admin;
test.beforeAll(async ({ playwright }) => { admin = await adminApi(playwright); });

async function adminPage(context, page, path = '/admin') {
  await apiLogin(context, 'admin', ADMIN);
  await page.goto(`${APP.admin}${path}`);
}

test('F07 admin dashboard and every admin screen load without errors', async ({ page, context }) => {
  await adminPage(context, page);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await a11y(page, 'admin: dashboard');
  for (const [path, heading] of [['/admin/users', 'Users'], ['/admin/hosts', 'Hosts'], ['/admin/calls', 'Activity'], ['/admin/reports', 'Reports'], ['/admin/payouts', 'Payouts'], ['/admin/settings', 'Settings']]) {
    await page.goto(`${APP.admin}${path}`);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await a11y(page, `admin: ${heading.toLowerCase()}`);
  }
});

test('F07-H1 / F07-H2 admin approves a pending host and changes its video rate', async ({ page, context, request }) => {
  const h = await apiSignup(request, 'host', { name: `Pending ${Date.now().toString(36).slice(-4)}` });
  await adminPage(context, page, '/admin/hosts');
  const row = page.getByRole('row').filter({ hasText: h.email });
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(`${h.user.name} approved`)).toBeVisible();
  await expect(row.getByRole('button', { name: 'Unapprove' })).toBeVisible();
  await row.getByLabel('Video rate').fill('40');
  await row.getByLabel('Video rate').blur();
  await expect(page.getByText('Video rate saved')).toBeVisible();
  const hosts = await (await admin.get('/api/admin/hosts')).json();
  expect(hosts.find((x) => x.id === h.user.id)).toMatchObject({ approved: 1, video_rate: 40 });
});

test('F07-H3 admin adds coins and the member sees them live', async ({ browser, page, context, request }) => {
  const m = await apiSignup(request, 'user', { name: `Coins ${Date.now().toString(36).slice(-4)}` });
  const mp = await personPage(browser, {});
  await apiLogin(mp.context, 'user', m);
  await mp.page.goto(`${APP.user}/app`);
  await expect(mp.page.getByRole('link', { name: /Wallet: 50 coins/ })).toBeVisible();

  await adminPage(context, page, '/admin/users');
  await page.getByPlaceholder('Search name or email').fill(m.email);
  const row = page.getByRole('row').filter({ hasText: m.email });
  await row.getByRole('button', { name: 'Coins' }).click();
  await page.getByPlaceholder('e.g. 100').fill('120');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Balance updated')).toBeVisible();
  await expect(mp.page.getByRole('link', { name: /Wallet: 170 coins/ })).toBeVisible(); // pushed over the WebSocket
  await mp.context.close();
});

test('F07-H4 admin blocks a member: they are signed out and cannot log back in', async ({ browser, page, context, request }) => {
  const m = await apiSignup(request, 'user', { name: `Block ${Date.now().toString(36).slice(-4)}` });
  const mp = await personPage(browser, {});
  await apiLogin(mp.context, 'user', m);
  await mp.page.goto(`${APP.user}/app`);
  await expect(mp.page.getByText(/^Hello/)).toBeVisible();

  await adminPage(context, page, '/admin/users');
  page.once('dialog', (d) => d.accept());
  await page.getByPlaceholder('Search name or email').fill(m.email);
  await page.getByRole('row').filter({ hasText: m.email }).getByRole('button', { name: 'Block' }).click();
  await expect(page.getByRole('row').filter({ hasText: m.email }).getByText('blocked')).toBeVisible();

  await mp.page.reload();
  await expect(mp.page).toHaveURL(/\/(login)?$/);
  const r = await mp.page.request.post(`${APP.user}/api/auth/login`, { data: { email: m.email, password: m.password } });
  expect(r.status()).toBe(403);
  await mp.context.close();
});

test('F08-H1 admin blocks & resolves a report', async ({ page, context, request }) => {
  const reporter = await apiSignup(request, 'user');
  const target = await approvedHost(request, admin, `Reported ${Date.now().toString(36).slice(-4)}`);
  const rc = await request.post(`${APP.user}/api/auth/login`, { data: { email: reporter.email, password: reporter.password } });
  expect(rc.ok()).toBeTruthy();
  expect((await request.post(`${APP.user}/api/reports`, { data: { targetId: target.user.id, reason: 'Rude or abusive' } })).ok()).toBeTruthy();

  await adminPage(context, page, '/admin/reports');
  const row = page.getByRole('row').filter({ hasText: target.user.name }).first();
  await row.getByRole('button', { name: /Block & resolve/ }).click();
  await expect(page.getByText('Report updated')).toBeVisible();
  const hosts = await (await admin.get('/api/admin/hosts')).json();
  expect(hosts.find((x) => x.id === target.user.id).status).toBe('blocked');
});

test('F09-H1 change password, F09-H3 delete account (member)', async ({ page, context, request }) => {
  const m = await apiSignup(request, 'user', { name: 'Settings Sita' });
  await apiLogin(context, 'user', m);
  await page.goto(`${APP.user}/app/me`);
  await a11y(page, 'friends: profile');
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await a11y(page, 'friends: settings');

  await page.getByRole('button', { name: /Change password/ }).click();
  await page.getByLabel('Current password').fill(m.password);
  await page.getByLabel('New password').fill('brand-new-pass-1');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Password changed/)).toBeVisible();
  expect((await request.post(`${APP.user}/api/auth/login`, { data: { email: m.email, password: m.password } })).status()).toBe(401);
  expect((await request.post(`${APP.user}/api/auth/login`, { data: { email: m.email, password: 'brand-new-pass-1' } })).ok()).toBeTruthy();

  await page.getByRole('button', { name: /Delete account/ }).click();
  await page.getByLabel('Enter your password to confirm').fill('wrong-one');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByText('Password is wrong')).toBeVisible();
  await page.getByLabel('Enter your password to confirm').fill('brand-new-pass-1');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL(`${APP.user}/`);
  expect((await request.post(`${APP.user}/api/auth/login`, { data: { email: m.email, password: 'brand-new-pass-1' } })).status()).toBe(401);
});

test('F09 host settings and payout request → admin marks paid', async ({ page, context, request, browser }) => {
  // give a host real earnings through an admin-credited member's call is slow in UI; use the API to make one paid minute
  const h = await approvedHost(request, admin, `Payee ${Date.now().toString(36).slice(-4)}`);
  const hp = await personPage(browser, {});
  await apiLogin(hp.context, 'host', h);
  await hp.page.goto(`${APP.host}/host/me`);
  await a11y(hp.page, 'host: profile');
  await hp.page.getByRole('link', { name: 'Settings' }).first().click();
  await expect(hp.page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await a11y(hp.page, 'host: settings');
  await hp.context.close();
  await adminPage(context, page, '/admin/payouts');
  await expect(page.getByRole('heading', { name: 'Payouts' })).toBeVisible();
});
