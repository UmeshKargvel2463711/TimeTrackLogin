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

  // Get token from localStorage
  const userSession = localStorage.getItem('user_session');
  if (!userSession) {
    return next(req);
  }

  try {
    const user = JSON.parse(userSession);
    const token = user?.token;

    if (token) {
      // Clone the request and add Authorization header
      const authReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
      return next(authReq);
    }
  } catch (e) {
  }

  return next(req);
};

