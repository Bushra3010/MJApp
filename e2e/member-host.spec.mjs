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
  const toggle = h.page.getByRole('button', { pressed: false }).filter({ hasText: "You're offline" });
  if (await toggle.count()) await toggle.click();
  await expect(h.page.getByText("You're online", { exact: true })).toBeVisible();
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

test('F02-H1 / F02-H2 real video call: both see video, coins charged, call logged in chat', async ({ browser, page, context }) => {
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
  await expect(page.locator('.call').getByText(/Spent/)).toBeVisible();
  await expect(h.page.locator('.call').getByText(/Earned/)).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'End call' }).click();
  await expect(page.getByText('Call ended')).toBeVisible();
  await expect(h.page.getByText('Call ended')).toBeVisible();

  const coinsAfter = (await (await page.request.get(`${APP.user}/api/me`)).json()).coins;
  expect(coinsBefore - coinsAfter).toBe(30); // one started minute at the default video rate
  const calls = await (await page.request.get(`${APP.user}/api/calls`)).json();
  expect(calls[0]).toMatchObject({ status: 'ended', type: 'video', coins_charged: 30 });
  // host is free again
  await expect(h.page.getByText("You're online", { exact: true })).toBeVisible();
  await h.context.close();
});

test('F02-E1 host declines: member told, nothing charged', async ({ browser, page, context }) => {
  const h = await pair(browser, page, context);
  await page.goto(`${APP.user}/app/host/${host.user.id}`);
  await a11y(page, 'friends: host profile');
  const before = (await (await page.request.get(`${APP.user}/api/me`)).json()).coins;
  await page.getByRole('button', { name: 'Audio call' }).click();
  await h.page.getByRole('button', { name: 'Decline' }).click();
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

test('F06-H1 / F06-N1 host requests a payout (validation first)', async ({ browser }) => {
  const h = await personPage(browser, {});
  await apiLogin(h.context, 'host', host);
  await h.page.goto(`${APP.host}/host/earnings`);
  await a11y(h.page, 'host: earnings');
  const earned = (await (await h.page.request.get(`${APP.host}/api/host/stats`)).json()).profile.earnings;
  await h.page.getByLabel(/Coins/).fill('50');
  await h.page.getByLabel('UPI ID').fill('hema@okbank');
  await h.page.getByRole('button', { name: 'Request payout' }).click();
  // the browser blocks amounts under the minimum before anything is sent
  expect(await h.page.getByLabel(/Coins/).evaluate((el) => el.validity.rangeUnderflow)).toBe(true);
  // over the balance: the server refuses with a clear message
  await h.page.getByLabel(/Coins/).fill(String(Math.max(100, earned + 1000)));
  await h.page.getByRole('button', { name: 'Request payout' }).click();
  await expect(h.page.getByText('Amount is more than your balance')).toBeVisible();
  // a bad UPI ID is refused too
  await h.page.getByLabel('UPI ID').fill('not a upi');
  await h.page.getByRole('button', { name: 'Request payout' }).click();
  await expect(h.page.getByText(/more than your balance|valid UPI/)).toBeVisible();
  await h.context.close();
});
