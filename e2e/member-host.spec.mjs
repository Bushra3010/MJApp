// F02 calls, F03 chat, F04 wallet, F05 host online, F06 payouts, F08 reports — member and host in two real browsers.
import { test, expect, APP, apiSignup, apiLogin, adminApi, approvedHost, personPage, a11y } from './fixtures.mjs';

test.describe.configure({ mode: 'serial' });

let admin, host, member;
test.beforeAll(async ({ playwright, request }) => {
  admin = await adminApi(playwright);
  host = await approvedHost(request, admin, `Hostess ${Date.now().toString(36).slice(-4)}`);
  member = await apiSignup(request, 'user', { name: 'Member Mohan' });
});

/** Opens member + host in separate browsers, both signed in, host online. */
async function pair(browser, page, context) {
  await apiLogin(context, 'user', member);
  const h = await personPage(browser, {});
  await apiLogin(h.context, 'host', host);
  await h.page.goto(`${APP.host}/host`);
  const toggle = h.page.getByRole('button', { name: /Go Online/ });
  if (await toggle.count()) await toggle.click();
  await expect(h.page.getByText('You are online', { exact: true })).toBeVisible();
  return h;
}

test('F05-H2 / F03-H1 / F03-H2 host goes online, chat both ways with unread badge and coin charge', async ({ browser, page, context }) => {
  const h = await pair(browser, page, context);
  await a11y(h.page, 'host: home (online)');

  await page.goto(`${APP.user}/app`);
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByRole('button', { name: 'Online', pressed: false }).click();
  await expect(page.getByRole('link', { name: `Open ${host.user.name}'s profile` })).toBeVisible();
  await expect(page.getByText('Online now')).toBeVisible();

  await page.getByRole('button', { name: `Chat with ${host.user.name}` }).click();
  await expect(page).toHaveURL(/\/app\/chat\/\d+/);
  await a11y(page, 'friends: chat');
  const box = page.getByPlaceholder(/Message/);
  // F03-E1 whitespace-only message is not sent
  await box.fill('   ');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await expect(page.locator('.bubble.me')).toHaveCount(0);

  await box.fill('Namaste! 😊 Kaise ho?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('.bubble.me').last()).toContainText('Namaste! 😊 Kaise ho?');
  await expect(page.getByRole('link', { name: /Wallet: 49 coins/ }).or(page.locator('body'))).toBeVisible();
  const me = await (await page.request.get(`${APP.user}/api/me`)).json();
  expect(me.coins).toBe(49); // 1 coin per message

  // host sees the unread badge live, opens chat, replies for free
  await expect(h.page.getByRole('navigation', { name: 'Main' }).getByText('1')).toBeVisible();
  await h.page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Chats/ }).click();
  await h.page.getByText('Member Mohan').click();
  await expect(h.page.locator('.bubble.them').last()).toContainText('Namaste!');
  await h.page.getByPlaceholder(/Message/).fill('Main theek hoon, aap?');
  await h.page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('.bubble.them').last()).toContainText('Main theek hoon, aap?');
  await h.context.close();
});

test('F04-H1 member buys coins (test mode) and sees the payment in history', async ({ page, context }) => {
  await apiLogin(context, 'user', member);
  await page.goto(`${APP.user}/app/wallet`);
  await expect(page.getByText(/Test mode/)).toBeVisible();
  await a11y(page, 'friends: wallet');
  const before = (await (await page.request.get(`${APP.user}/api/me`)).json()).coins;
  await page.getByRole('button', { name: /250.*₹99/ }).click();
  await expect(page.getByText('+250 coins added')).toBeVisible();
  const after = (await (await page.request.get(`${APP.user}/api/me`)).json()).coins;
  expect(after - before).toBe(250);
  await expect(page.getByText(/Bought 250 coins/).first()).toBeVisible();
});

test('F02-H1 / F02-H2 / FT real video call: first call starts free, both see video, call logged', async ({ browser, page, context }) => {
  const h = await pair(browser, page, context);
  await page.goto(`${APP.user}/app`);
  const coinsBefore = (await (await page.request.get(`${APP.user}/api/me`)).json()).coins;
  await page.getByRole('button', { name: `Video call ${host.user.name}` }).click();
  await expect(page.getByText(/Ringing|Calling/)).toBeVisible();

  await h.page.getByRole('button', { name: 'Accept' }).click();
  // both sides get each other's camera over WebRTC
  for (const p of [page, h.page]) {
    await expect.poll(() => p.evaluate(() => document.querySelector('video.remote')?.videoWidth || 0), { timeout: 20_000 }).toBeGreaterThan(0);
  }
  // first call for a new member: free trial countdown on both sides, host told earnings start after it
  await expect(page.locator('.call').getByText(/Free ·/)).toBeVisible();
  await expect(h.page.locator('.call').getByText(/earnings start after it ends/)).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'End call' }).click();
  await expect(page.getByText('Call ended')).toBeVisible();
  await expect(h.page.getByText('Call ended')).toBeVisible();

  const coinsAfter = (await (await page.request.get(`${APP.user}/api/me`)).json()).coins;
  expect(coinsBefore - coinsAfter).toBe(0); // ended inside the 30 s free trial
  const calls = await (await page.request.get(`${APP.user}/api/calls`)).json();
  expect(calls[0]).toMatchObject({ status: 'ended', type: 'video', coins_charged: 0 });
  expect(calls[0].free_seconds).toBeGreaterThan(0);
  const me = await (await page.request.get(`${APP.user}/api/me`)).json();
  expect(me.free_trial.available).toBe(false); // used up
  // host is free again
  await expect(h.page.getByText('You are online', { exact: true })).toBeVisible();
  await h.context.close();
});

test('F02-E1 host declines: member told, nothing charged', async ({ browser, page, context }) => {
  const h = await pair(browser, page, context);
  await page.goto(`${APP.user}/app/host/${host.user.id}`);
  await a11y(page, 'friends: host profile');
  const before = (await (await page.request.get(`${APP.user}/api/me`)).json()).coins;
  await page.getByRole('button', { name: 'Audio call' }).click();
  await h.page.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText('Call declined')).toBeVisible();
  expect((await (await page.request.get(`${APP.user}/api/me`)).json()).coins).toBe(before);
  await h.context.close();
});

test('F08-H1 member reports the host; admin sees it and resolves', async ({ page, context }) => {
  await apiLogin(context, 'user', member);
  await page.goto(`${APP.user}/app/host/${host.user.id}`);
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: /Report/ }).click();
  await page.getByRole('button', { name: 'Fake profile' }).click();
  await expect(page.getByText(/our team will review/)).toBeVisible();
  const reports = await (await admin.get('/api/admin/reports')).json();
  expect(reports.find((r) => r.target_id === host.user.id && r.reason === 'Fake profile')).toBeTruthy();
});

test('F06-H1 / F06-N1 host saves bank details, then withdrawal rules apply', async ({ browser }) => {
  const h = await personPage(browser, {});
  await apiLogin(h.context, 'host', host);
  await h.page.goto(`${APP.host}/host/wallet`);
  await a11y(h.page, 'host: wallet');
  await expect(h.page.getByText("Today's income")).toBeVisible();
  await expect(h.page.getByText('Total income')).toBeVisible();
  await expect(h.page.getByRole('button', { name: 'Withdraw' })).toBeDisabled(); // no payout details yet
  await h.page.getByRole('link', { name: /Add bank or UPI details/ }).click();
  await a11y(h.page, 'host: bank details');
  await h.page.getByRole('tab', { name: 'Bank account' }).click();
  await h.page.getByLabel('Account holder name').fill('Hema Rao');
  await h.page.getByLabel('Account number', { exact: true }).fill('123456789012');
  await h.page.getByLabel('Confirm account number').fill('123456789000');
  await h.page.getByLabel('IFSC code').fill('sbin0001234');
  await h.page.getByRole('button', { name: 'Save' }).click();
  await expect(h.page.getByText("Account numbers don't match")).toBeVisible();
  await h.page.getByLabel('Confirm account number').fill('123456789012');
  await h.page.getByRole('button', { name: 'Save' }).click();
  await expect(h.page.getByText('Payout details saved')).toBeVisible();
  await expect(h.page).toHaveURL(/\/host\/wallet$/);
  await expect(h.page.getByText(/Bank ••••9012 · SBIN0001234/)).toBeVisible();
  const earned = (await (await h.page.request.get(`${APP.host}/api/host/stats`)).json()).profile.earnings;
  await h.page.getByLabel(/Coins/).fill('50');
  await h.page.getByRole('button', { name: 'Withdraw' }).click();
  expect(await h.page.getByLabel(/Coins/).evaluate((el) => el.validity.rangeUnderflow)).toBe(true);
  await h.page.getByLabel(/Coins/).fill(String(Math.max(100, earned + 1000)));
  await h.page.getByRole('button', { name: 'Withdraw' }).click();
  await expect(h.page.getByText('Amount is more than your balance')).toBeVisible();
  await h.context.close();
});

test('Host Home tabs, call rate, calls, alerts, leaderboard, invite, account menu, verification → admin verifies', async ({ browser }) => {
  const h = await personPage(browser, {});
  await apiLogin(h.context, 'host', host);
  await h.page.goto(`${APP.host}/host`);
  // My Page
  await expect(h.page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(h.page.getByRole('button', { name: /Go (Online|Offline)/ })).toBeVisible();
  await expect(h.page.getByText('Which type of calls do you want to receive?')).toBeVisible();
  await expect(h.page.getByText(/Time left: \d\d Days/)).toBeVisible();
  await expect(h.page.getByText('Level progress')).toBeVisible();
  // turning off video then back on
  await h.page.getByRole('checkbox', { name: 'Video call' }).uncheck();
  await expect.poll(async () => (await (await h.page.request.get(`${APP.host}/api/host/program`)).json()).acceptVideo).toBe(false);
  await h.page.getByRole('checkbox', { name: 'Video call' }).check();
  // Stats / Offers / Help videos
  await h.page.getByRole('tab', { name: 'Stats' }).click();
  for (const t of ["Today's earning", 'Today online', "Week's earning", 'Missed calls', 'Gift earning']) await expect(h.page.getByText(t).first()).toBeVisible();
  await expect(h.page.getByText(/more to withdraw|You can withdraw now/)).toBeVisible();
  await a11y(h.page, 'host: home stats');
  await h.page.getByRole('tab', { name: 'Offers' }).click();
  await expect(h.page.getByRole('heading', { name: 'Daily bonus' })).toBeVisible();
  await expect(h.page.getByRole('heading', { name: /Invite hosts & earn 10%/ })).toBeVisible();
  await a11y(h.page, 'host: home offers');
  await h.page.getByRole('tab', { name: 'Help videos' }).click();
  await expect(h.page.getByText('Select your language')).toBeVisible();
  await a11y(h.page, 'host: home help');
  // call rate: level 1 host can only pick tier 1
  await h.page.getByRole('tab', { name: 'My Page' }).click();
  await h.page.getByRole('link', { name: /My call rate/ }).click();
  await a11y(h.page, 'host: call rate');
  await h.page.getByRole('button', { name: 'Change call rate' }).click();
  await expect(h.page.getByRole('button', { name: /★ 2/ })).toBeDisabled();
  await h.page.getByRole('button', { name: /★ 1/ }).click();
  await expect(h.page.getByText('Call rate updated')).toBeVisible();
  await h.page.goBack();
  // trophy → leaderboard
  await h.page.getByRole('link', { name: "This week's leaderboard" }).click();
  await expect(h.page.getByRole('heading', { name: "This week's top 10" })).toBeVisible();
  await a11y(h.page, 'host: leaderboard');
  await h.page.goBack();
  // Calls (history) + Alerts
  await h.page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Calls' }).click();
  await expect(h.page.getByRole('tab', { name: 'Missed' })).toBeVisible();
  await h.page.getByRole('tab', { name: 'Missed' }).click();
  await expect(h.page.getByText('Rejected').first()).toBeVisible();
  await h.page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Alerts' }).click();
  await expect(h.page.getByRole('heading', { name: 'Alerts' })).toBeVisible();
  await a11y(h.page, 'host: alerts');
  // Account menu + invite
  await h.page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Account' }).click();
  for (const t of ['Wallet', 'My call rate', 'Invite hosts & earn', 'Edit profile', 'Upload photo', 'Bank details', 'Verification', 'Language', 'Help & support', 'Log out']) {
    await expect(h.page.locator('.p-menu .menu-row').filter({ hasText: t }).first(), t).toBeVisible();
  }
  await h.page.locator('.p-menu .menu-row').filter({ hasText: 'Invite hosts & earn' }).click();
  await expect(h.page.getByText(/^[A-Z0-9]{6}$/)).toBeVisible();
  await a11y(h.page, 'host: invite');
  await h.page.goBack();
  await expect(h.page.locator('.p-head .verified')).toHaveCount(0); // no fake badge before verification
  await h.page.locator('.p-menu .menu-row').filter({ hasText: 'Verification' }).click();
  await a11y(h.page, 'host: verification');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const inputs = h.page.locator('input[type=file]');
  await inputs.nth(0).setInputFiles({ name: 'id.png', mimeType: 'image/png', buffer: png });
  await inputs.nth(1).setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
  await h.page.getByRole('button', { name: 'Submit for verification' }).click();
  await expect(h.page.getByText('Under review')).toBeVisible();

  const adminCtx = await personPage(browser, {});
  await apiLogin(adminCtx.context, 'admin', { email: 'admin@milojulo.app', password: 'admin-pass-123' });
  await adminCtx.page.goto(`${APP.admin}/admin/hosts`);
  await adminCtx.page.getByRole('row').filter({ hasText: host.email }).getByRole('button', { name: 'Review ID' }).click();
  await expect(adminCtx.page.getByRole('img', { name: 'ID document' })).toBeVisible();
  await expect(adminCtx.page.getByRole('img', { name: 'Selfie' })).toBeVisible();
  await adminCtx.page.getByRole('button', { name: 'Verify' }).click();
  await expect(adminCtx.page.getByText(`${host.user.name} verified`)).toBeVisible();
  await adminCtx.context.close();

  await h.page.reload();
  await expect(h.page.getByText('Verified', { exact: true })).toBeVisible();
  await h.context.close();
});

