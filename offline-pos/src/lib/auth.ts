/**
 * auth.ts — Frappe Auth helper (doppio-independent)
 * Reads user session from cookies, handles login/logout.
 */

import call from './call';

export default class Auth {
  isLoggedIn: boolean;
  user: string | null;
  user_image: string | null;
  cookie: Record<string, string>;

  constructor() {
    this.isLoggedIn = false;
    this.user = null;
    this.user_image = null;

    // Parse all cookies into a dict
    this.cookie = Object.fromEntries(
      document.cookie
        .split('; ')
        .filter(Boolean)
        .map((part) => {
          const [key, ...rest] = part.split('=');
          return [key, decodeURIComponent(rest.join('='))];
        })
    );

    this.isLoggedIn =
      !!this.cookie.user_id && this.cookie.user_id !== 'Guest';
    this.user = this.isLoggedIn ? this.cookie.user_id : null;
  }

  async login(email: string, password: string): Promise<any> {
    const res = await call('login', { usr: email, pwd: password });
    if (res) {
      this.isLoggedIn = true;
      this.user = email;
      return res;
    }
    return false;
  }

  async logout(): Promise<void> {
    await call('logout');
    this.isLoggedIn = false;
    this.user = null;
    window.location.reload();
  }
}
