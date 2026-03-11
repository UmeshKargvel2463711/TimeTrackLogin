import { HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * HTTP Interceptor that adds JWT token to all API requests
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);

  // Only add token in browser
  if (!isPlatformBrowser(platformId)) {
    return next(req);
  }

  let token: string | null = null;

  // Try to get token from user_session object first
  const userSession = localStorage.getItem('user_session');
  if (userSession) {
    try {
      const user = JSON.parse(userSession);
      token = user?.token || user?.accessToken || user?.jwtToken;
    } catch (e) {
      // Failed to parse, continue to next fallback
    }
  }

  // Fallback to standalone token key if not found in user_session
  if (!token) {
    token = localStorage.getItem('token');
  }

  if (token) {
    // Clone the request and add Authorization header
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(authReq);
  }

  return next(req);
};

