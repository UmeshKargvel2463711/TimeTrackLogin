import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private router = inject(Router);
    private platformId = inject(PLATFORM_ID);

    /**
     * currentUser signal holds the logged-in user's data (name, email, role).
     * Used by components to display user information in the header.
     */
    currentUser = signal<any>(null);

    constructor() {
        // On initialization, check if a session exists in the browser's storage
        if (isPlatformBrowser(this.platformId)) {
            const savedUser = localStorage.getItem('user_session');
            if (savedUser) {
                this.currentUser.set(JSON.parse(savedUser));
            }
        }
    }

    /**
     * Registers a new user and saves them to the local 'users' database.
     * Performs auto-login after successful registration.
     */
    register(userData: any) {
        if (isPlatformBrowser(this.platformId)) {
            // Get existing users or start with an empty array
            const users = JSON.parse(localStorage.getItem('users') || '[]');

            // Save the new user
            users.push(userData);
            localStorage.setItem('users', JSON.stringify(users));

            // Auto-login logic
            this.currentUser.set(userData);
            localStorage.setItem('user_session', JSON.stringify(userData));

            // Navigate to the appropriate dashboard
            this.navigateToDashboard(userData.role);
        }
    }

    /**
     * Validates user credentials against the local 'users' array.
     * Returns true if successful, false otherwise.
     */
    login(email: string, password: string): boolean {
        if (isPlatformBrowser(this.platformId)) {
            const users = JSON.parse(localStorage.getItem('users') || '[]');
            const foundUser = users.find((u: any) => u.email === email && u.password === password);

            if (foundUser) {
                this.currentUser.set(foundUser);
                localStorage.setItem('user_session', JSON.stringify(foundUser));
                this.navigateToDashboard(foundUser.role);
                return true;
            }
        }
        return false;
    }

    /**
     * Private helper to handle role-based redirection.
     * Redirects to /manager/dashboard, /employee/dashboard, etc.
     */
    private navigateToDashboard(role: string) {
        if (!role) return;
        const route = role.toLowerCase();
        this.router.navigate([`/${route}/dashboard`]);
    }

    /**
     * Clears the current session and redirects to the landing page.
     */
    logout() {
        this.currentUser.set(null);
        if (isPlatformBrowser(this.platformId)) {
            localStorage.removeItem('user_session');
        }
        this.router.navigate(['/landing']);
    }

    /**
     * Utility to check if a user is currently logged in.
     */
    isLoggedIn(): boolean {
        return this.currentUser() !== null;
    }
}