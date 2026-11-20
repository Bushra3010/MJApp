export const homeFor = (role) => ({ admin: '/admin', host: '/host', user: '/app' }[role] || '/');
