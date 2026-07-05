import { reactive } from 'vue';
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
    this.cookie = {};
    this.refresh();
  }

  refresh() {
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

    // Cache the user_id if we are logged in online
    if (this.isLoggedIn && this.cookie.user_id) {
      localStorage.setItem('last_logged_in_user', this.cookie.user_id);
    }
    // Recovery fallback if we are offline and have a cached user
    else if (!navigator.onLine && localStorage.getItem('last_logged_in_user')) {
      this.isLoggedIn = true;
      this.user = localStorage.getItem('last_logged_in_user');
    }
  }

  async login(email: string, password: string): Promise<any> {
    const res = await call('login', { usr: email, pwd: password });
    if (res) {
      this.refresh();
      return res;
    }
    return false;
  }

  async logout(): Promise<void> {
    await call('logout');
    this.isLoggedIn = false;
    this.user = null;
    localStorage.removeItem('last_logged_in_user');
    window.location.reload();
  }

  async checkOnlineSessionActive(): Promise<boolean> {
    try {
      const res = await fetch('/api/method/frappe.auth.get_logged_user', {
        method: 'GET',
        headers: {
          'X-Frappe-Site-Name': window.location.hostname,
          'Accept': 'application/json',
        },
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        return false;
      }
      if (res.ok) {
        const data = await res.json();
        const loggedUser = data.message;
        return loggedUser && loggedUser !== 'Guest';
      }
      return true;
    } catch {
      // If server is unreachable, assume active to avoid false redirection
      return true;
    }
  }

  clearLocalCookies() {
    document.cookie = 'user_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
    document.cookie = 'sid=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
    this.isLoggedIn = false;
    this.user = null;
  }
}

export const auth = reactive(new Auth());

