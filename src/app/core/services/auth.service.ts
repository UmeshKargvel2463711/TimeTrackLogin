import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);
  private http = inject(HttpClient);
  private notificationService = inject(NotificationService);

  private readonly API_URL = 'https://localhost:7172/api/Auth';

  currentUser = signal<any>(null);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const savedUser = localStorage.getItem('user_session');
      if (savedUser) {
        this.currentUser.set(JSON.parse(savedUser));
        // Initialize notification polling if user was already logged in
        this.notificationService.initializePolling();
      }
    }
  }

  /**
   * Login via API
   */
  loginAsync(email: string, password: string): Observable<any> {
    return this.http.post(`${this.API_URL}/login`, { email, password });
  }

  /**
   * Sets the current user after successful login
   */
  setCurrentUser(user: any) {
    this.currentUser.set(user);
    this.saveToStorage(user);
    // Initialize notification polling after login
    this.notificationService.initializePolling();
  }

  /**
   * Register via API - Employee/Manager goes to pending approval
   */
  registerAsync(userData: any): Observable<any> {
    return this.http.post(`${this.API_URL}/register`, userData);
  }

  private saveToStorage(user: any) {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('user_session', JSON.stringify(user));
      localStorage.setItem('isLoggedIn', 'true');

      // Store token separately for easy access by ApiService
      if (user.token) {
        localStorage.setItem('token', user.token);
      } else if (user.accessToken) {
        localStorage.setItem('token', user.accessToken);
      } else if (user.jwtToken) {
        localStorage.setItem('token', user.jwtToken);
      } else {
        console.warn('⚠️ AuthService - No token found in user object:', Object.keys(user));
      }
    }
  }

  /**
   * Role-based redirection
   */
  navigateToDashboard(role: string) {
    if (!role) return;
    const r = role.toLowerCase();

    if (r === 'admin') {
      this.router.navigate(['/admin/users'], { replaceUrl: true });
    } else if (r === 'employee') {
      this.router.navigate(['/employee/loghours'], { replaceUrl: true });
    } else {
      this.router.navigate(['/manager/team-logs'], { replaceUrl: true });
    }
  }

  logout() {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('timerSession');
      localStorage.removeItem('user_session');
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('token'); // Also remove the token
    }
    this.currentUser.set(null);
    this.router.navigate(['/signin']);
  }

  isLoggedIn(): boolean {
    return this.currentUser() !== null;
  }
}
