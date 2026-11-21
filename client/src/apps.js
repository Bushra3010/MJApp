// Which of the three apps this build is, and where the other two live.
export const APP = import.meta.env.VITE_APP || 'user';

const PROD = {
  user: 'https://milo-julo.milojulooo.workers.dev',
  host: 'https://milo-julo-host.milojulooo.workers.dev',
  admin: 'https://milo-julo-admin.milojulooo.workers.dev',
};
const DEV = { user: 'http://localhost:5173', host: 'http://localhost:5174', admin: 'http://localhost:5175' };

export const APP_URL = import.meta.env.DEV ? DEV : PROD;
export const APP_NAME = { user: 'Milo Julo', host: 'Milo Julo Host', admin: 'Milo Julo Admin' };
