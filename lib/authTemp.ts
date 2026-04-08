// Temporary in-memory store for password during signup flow.
// Never stored in URL params, browser history, or localStorage.
let _pendingPassword: string | null = null;

export const setPendingPassword = (password: string) => {
  _pendingPassword = password;
};

export const consumePendingPassword = (): string | null => {
  const p = _pendingPassword;
  _pendingPassword = null;
  return p;
};
