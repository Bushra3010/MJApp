// F01 sign up / log in on the friends app, F05-H1 host sign-up, F07-N1 admin app, three-app separation.
import { test, expect, APP, apiSignup, a11y } from './fixtures.mjs';

const uniq = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

async function fillSignup(page, { name, email, dob = '1995-05-05', password = 'qa-pass-12345', terms = true }) {
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Date of birth').fill(dob);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  if (terms) await page.getByRole('checkbox').check();
}

test('F01-H1/E4/E6 member signs up (emoji name, double-click) and lands on Discover with 50 coins', async ({ page }) => {
  await page.goto(`${APP.user}/`);
  await a11y(page, 'friends: landing');
  await page.goto(`${APP.user}/login?mode=signup`);
  await expect(page.getByText('Make friends')).toHaveCount(0); // no account-type picker any more
  await a11y(page, 'friends: sign up');
  const email = `qa+f01${uniq()}@example.com`;
  await fillSignup(page, { name: 'Zoë 🌸 Kapoor', email });
  const btn = page.getByRole('button', { name: 'Create account' });
  await btn.dblclick();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('link', { name: /Wallet: 50 coins/ })).toBeVisible();
  await expect(page.getByText('Hello Zoë')).toBeVisible();
  await a11y(page, 'friends: discover');
  // double-click created exactly one account: signing up again with same email is refused
  const again = await page.request.post(`${APP.user}/api/auth/register`, { data: { name: 'Dup', email, password: 'qa-pass-12345', birthDate: '1995-05-05', acceptTerms: true } });
  expect(again.status()).toBe(400);
  // F01-E8 refresh keeps the session
  await page.reload();
  await expect(page.getByText('Hello Zoë')).toBeVisible();
});

test('F01-E1 under-18 sign-up is refused', async ({ page }) => {
  await page.goto(`${APP.user}/login?mode=signup`);
  // the date picker blocks under-18 dates; bypass it to check the server rule too
  await fillSignup(page, { name: 'Young Person', email: `qa+kid${uniq()}@example.com` });
  await page.getByLabel('Date of birth').evaluate((el) => { el.removeAttribute('max'); });
  await page.getByLabel('Date of birth').fill('2012-03-03');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(/18 or older/i).last()).toBeVisible();
  await expect(page).toHaveURL(/login/);
});

test('F01-E2 terms must be accepted', async ({ page }) => {
  await page.goto(`${APP.user}/login?mode=signup`);
  await fillSignup(page, { name: 'No Terms', email: `qa+nt${uniq()}@example.com`, terms: false });
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/login/);
  expect(await page.getByRole('checkbox').evaluate((el) => el.validity.valueMissing)).toBe(true);
});

test('F01-N1 wrong password shows an error', async ({ page, request }) => {
  const m = await apiSignup(request, 'user');
  await page.goto(`${APP.user}/login`);
  await a11y(page, 'friends: log in');
  await page.getByLabel('Email').fill(m.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click(); // the tab is role=tab, so this is the submit button
  await expect(page.getByText('Wrong email or password')).toBeVisible();
});

test('F01-N2 host account on the friends app is pointed to the host app', async ({ page, request }) => {
  const h = await apiSignup(request, 'host');
  await page.goto(`${APP.user}/login`);
  await page.getByLabel('Email').fill(h.email);
  await page.getByLabel('Password').fill(h.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click(); // the tab is role=tab, so this is the submit button
  await expect(page.getByText(/Please use the Milo Julo Host app/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Open Milo Julo Host/ })).toHaveAttribute('href', `${APP.host}/login`);
});

test('F05-H1 host signs up on the host app and waits for approval', async ({ page }) => {
  await page.goto(`${APP.host}/`);
  await expect(page.getByText('Talk. Connect.')).toBeVisible();
  await a11y(page, 'host: landing');
  await page.goto(`${APP.host}/login?mode=signup`);
  await fillSignup(page, { name: 'Host Hema', email: `qa+hh${uniq()}@example.com` });
  await page.getByRole('button', { name: 'Apply as host' }).click();
  await expect(page).toHaveURL(/\/host$/);
  await expect(page.getByText(/Waiting for approval/i).first()).toBeVisible();
  await a11y(page, 'host: home (pending)');
});

test('F07-N1 admin app has no public sign-up and refuses non-admin emails', async ({ page }) => {
  await page.goto(`${APP.admin}/`);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Admin log in' })).toBeVisible();
  await a11y(page, 'admin: log in');
  await page.getByRole('button', { name: 'Set up the admin account' }).click();
  await fillSignup(page, { name: 'Intruder', email: `qa+intruder${uniq()}@example.com` });
  await page.getByRole('button', { name: 'Create admin account' }).click();
  await expect(page.getByText(/only be created for approved admin emails/)).toBeVisible();
});

test('X-3 no horizontal scroll at phone width on public pages', async ({ page }) => {
  for (const url of [`${APP.user}/`, `${APP.user}/login?mode=signup`, `${APP.host}/`, `${APP.admin}/login`, `${APP.user}/privacy`]) {
    await page.goto(url);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `horizontal overflow on ${url}`).toBeLessThanOrEqual(1);
  }
});
