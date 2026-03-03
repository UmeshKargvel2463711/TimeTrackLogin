/**
 * Role-Based Access Control (RBAC) Guards
 * Consolidated guard file for all role-based route protection
 */

import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * No-Auth Guard
 * Prevents logged-in users from accessing unauthenticated routes like sign-in, signup, home
 */
export const noAuthGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  if (isPlatformBrowser(platformId)) {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    if (isLoggedIn === 'true') {
      // Get user role and redirect to their dashboard
      const userSession = localStorage.getItem('user_session');
      if (userSession) {
        const user = JSON.parse(userSession);
        const role = user.role?.toLowerCase();

        if (role === 'admin') {
          router.navigate(['/admin/users'], { replaceUrl: true });
        } else if (role === 'manager') {
          router.navigate(['/manager/team-logs'], { replaceUrl: true });
        } else if (role === 'employee') {
          router.navigate(['/employee/loghours'], { replaceUrl: true });
        } else {
          router.navigate(['/'], { replaceUrl: true });
        }
      } else {
        router.navigate(['/'], { replaceUrl: true });
      }
      return false;
    }
  }
  return true;
};

/**
 * Authentication Guard
 * Checks if user is logged in before accessing any protected routes
 */
export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  if (isPlatformBrowser(platformId)) {
    const isLoggedIn = localStorage.getItem('isLoggedIn');

    if (isLoggedIn === 'true') {
      return true;
    } else {
      alert('Access Denied - Login Required');
      router.navigate(['/signin']);
      return false;
    }
  }
  return false;
};

/**
 * Admin Role Guard
 * Restricts access to admin-only routes
 */
export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = authService.currentUser();

  if (user && user.role === 'Admin') {
    return true;
  }

  if (!user) {
    router.navigate(['/signin']);
  } else {
    router.navigate(['/unauthorized']);
  }
  return false;
};

/**
 * Employee Role Guard
 * Restricts access to employee-only routes
 */
export const employeeGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = authService.currentUser();

  if (user && user.role === 'Employee') {
    return true;
  }

  if (!user) {
    router.navigate(['/signin']);
  } else {
    router.navigate(['/unauthorized']);
  }
  return false;
};

/**
 * Manager Role Guard
 * Restricts access to manager-only routes
 */
export const managerGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = authService.currentUser();

  if (user && user.role === 'Manager') {
    return true;
  }

  if (!user) {
    router.navigate(['/signin']);
  } else {
    router.navigate(['/unauthorized']);
  }
  return false;
};

/**
 * Generic Role Guard (for checking multiple roles)
 * Usage: canActivate: [roleGuard(allowedRoles)]
 */
export function roleGuard(allowedRoles: string[]): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);
    const user = authService.currentUser();

    if (user && allowedRoles.includes(user.role)) {
      return true;
    }

    if (!user) {
      router.navigate(['/signin']);
    } else {
      router.navigate(['/']);
    }
    return false;
  };
}

