// Removing an email from ADMIN_EMAILS must end that admin's access, including sessions already signed in.
// Runs wrangler dev twice on the same local data with a different ADMIN_EMAILS.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const PORT = 8798, base = `http://localhost:${PORT}`;
const persist = mkdtempSync(path.join(tmpdir(), 'mj-admin-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function start(adminEmails) {
  const p = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--persist-to', persist,
    '--var', 'JWT_SECRET:test-secret-0123456789abcdef0123456789abcdef', '--var', `ADMIN_EMAILS:${adminEmails}`, '--var', 'TRUST_APP_HEADER:true', '--var', 'DISABLE_RATE_LIMIT:true'],
  { cwd: 'worker', stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await fetch(base + '/api/health').then((r) => r.ok).catch(() => false)); i++) await sleep(500);
  return p;
}
const call = async (p, { method = 'GET', body, token } = {}) => {
  const r = await fetch(base + '/api' + p, { method, headers: { 'content-type': 'application/json', 'x-mj-app': 'admin', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const ok = (m) => console.log('✓', m);
let srv;
try {
  srv = await start('boss@test.io,temp@test.io');
  const t = await call('/auth/register', { method: 'POST', body: { name: 'Temp Admin', email: 'temp@test.io', password: 'temp-pass-123', birthDate: '1990-01-01', acceptTerms: true } });
  assert.equal(t.body.user.role, 'admin');
  assert.equal((await call('/admin/stats', { token: t.body.token })).status, 200); ok('listed email can use the admin app');
  srv.kill(); await sleep(1500);

  srv = await start('boss@test.io'); // temp@test.io removed from the list
  assert.equal((await call('/admin/stats', { token: t.body.token })).status, 401); ok('removed admin: existing session stops working');
  const again = await call('/auth/login', { method: 'POST', body: { email: 'temp@test.io', password: 'temp-pass-123' } });
  assert.equal(again.status, 403); assert.match(again.body.error, /Admin access for this account has been removed/); ok('removed admin: cannot log in again');
  console.log('\nALL PASSED');
} catch (e) { console.error('FAILED:', e); process.exitCode = 1; } finally { srv?.kill(); setTimeout(() => process.exit(), 300); }
