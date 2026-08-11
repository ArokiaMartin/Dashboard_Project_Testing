import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';

export interface User {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
}

export interface StoredUser extends User {
  passwordHash: string;
}

const USERS_STORAGE_KEY = 'app_registered_users';
const CURRENT_USER_KEY = 'app_current_user';
export const REQUIRED_EMAIL_DOMAIN = '@hyland.com';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  public currentUser = signal<User | null>(null);
  public isLoggedIn = signal<boolean>(false);

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$: Observable<User | null> = this.currentUserSubject.asObservable();

  constructor(private router: Router) {
    this.initAuth();
  }

  private initAuth(): void {
    // Ensure default seeded user exists in local storage
    this.seedDefaultUser();

    const storedUserJson = localStorage.getItem(CURRENT_USER_KEY);
    if (storedUserJson) {
      try {
        const user: User = JSON.parse(storedUserJson);
        this.setUserSession(user);
      } catch (e) {
        this.clearUserSession();
      }
    }
  }

  private seedDefaultUser(): void {
    const users = this.getStoredUsers();
    const defaultEmail = 'alexander@hyland.com';
    const exists = users.some(u => u.email.toLowerCase() === defaultEmail);

    if (!exists) {
      const defaultUser: StoredUser = {
        id: 'usr_default_01',
        fullName: 'Alexander Martin',
        email: defaultEmail,
        passwordHash: 'Password123!',
        createdAt: new Date().toISOString()
      };
      users.push(defaultUser);
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    }
  }

  public validateHylandEmail(email: string): boolean {
    if (!email) return false;
    const trimmed = email.trim().toLowerCase();
    return trimmed.endsWith(REQUIRED_EMAIL_DOMAIN) && trimmed.length > REQUIRED_EMAIL_DOMAIN.length + 1;
  }

  public signup(fullName: string, email: string, password: string): { success: boolean; message?: string; user?: User } {
    const cleanEmail = email.trim().toLowerCase();

    if (!this.validateHylandEmail(cleanEmail)) {
      return {
        success: false,
        message: `Email must be a valid Hyland corporate email ending with ${REQUIRED_EMAIL_DOMAIN}`
      };
    }

    if (!fullName || fullName.trim().length < 2) {
      return { success: false, message: 'Please enter your full name (minimum 2 characters).' };
    }

    if (!password || password.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters long.' };
    }

    const users = this.getStoredUsers();
    if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
      return { success: false, message: `An account with ${cleanEmail} already exists. Please login instead.` };
    }

    const newUser: StoredUser = {
      id: 'usr_' + Date.now().toString(36),
      fullName: fullName.trim(),
      email: cleanEmail,
      passwordHash: password,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));

    const userSession: User = {
      id: newUser.id,
      fullName: newUser.fullName,
      email: newUser.email,
      createdAt: newUser.createdAt
    };

    this.setUserSession(userSession);
    return { success: true, user: userSession };
  }

  public login(email: string, password: string): { success: boolean; message?: string; user?: User } {
    const cleanEmail = email.trim().toLowerCase();

    if (!this.validateHylandEmail(cleanEmail)) {
      return {
        success: false,
        message: `Email must end with ${REQUIRED_EMAIL_DOMAIN} (e.g. alexander@hyland.com)`
      };
    }

    if (!password) {
      return { success: false, message: 'Please enter your password.' };
    }

    const users = this.getStoredUsers();
    const userMatch = users.find(u => u.email.toLowerCase() === cleanEmail && u.passwordHash === password);

    if (!userMatch) {
      return { success: false, message: 'Invalid email or password. Please check your credentials.' };
    }

    const userSession: User = {
      id: userMatch.id,
      fullName: userMatch.fullName,
      email: userMatch.email,
      createdAt: userMatch.createdAt
    };

    this.setUserSession(userSession);
    return { success: true, user: userSession };
  }

  public logout(): void {
    this.clearUserSession();
    this.router.navigate(['/login']);
  }

  private setUserSession(user: User): void {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
    this.isLoggedIn.set(true);
    this.currentUserSubject.next(user);
  }

  private clearUserSession(): void {
    localStorage.removeItem(CURRENT_USER_KEY);
    this.currentUser.set(null);
    this.isLoggedIn.set(false);
    this.currentUserSubject.next(null);
  }

  public updatePassword(email: string, newPassword: string): boolean {
    const cleanEmail = email.trim().toLowerCase();
    const users = this.getStoredUsers();
    const userIndex = users.findIndex(u => u.email.toLowerCase() === cleanEmail);

    if (userIndex !== -1) {
      users[userIndex].passwordHash = newPassword;
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
      return true;
    }
    return false;
  }

  private getStoredUsers(): StoredUser[] {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
}
