import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

// ============================================================================
// PUBLIC ENDPOINTS (No JWT Required)
// Based on Backend API Documentation
// ============================================================================

const PUBLIC_ENDPOINTS = [
  '/api/users/login',
  '/api/users/register',
  '/api/users/refresh',
  '/api/users/search',
  '/api/users/all',
  '/api/movies/trending',
  '/api/movies/popular',
  '/api/movies/random',
  '/api/movies/search',
] as const;

/** Endpoints that always require authentication */
const AUTHENTICATED_ENDPOINTS = [
  '/api/users/me',
  '/api/users/logout',
  '/api/users/2fa/status',
  '/api/users/2fa/enable',
  '/api/users/2fa/verify',
  '/api/users/2fa/disable',
] as const;

const PUBLIC_PATTERNS = [
  /^\/api\/users\/[^/]+\/followers$/, // /api/users/{username}/followers
  /^\/api\/users\/[^/]+\/following$/, // /api/users/{username}/following
  /^\/api\/movies\/\d+$/, // /api/movies/{tmdbId}
  /^\/api\/movies\/\d+\/similar$/, // /api/movies/{tmdbId}/similar
  /^\/api\/ratings\/movie\/\d+\/average$/, // /api/ratings/movie/{tmdbId}/average
] as const;

// ============================================================================
// AUTH INTERCEPTOR
// Angular 2026 Standard: Functional HttpInterceptor
// ============================================================================

/**
 * HTTP Interceptor that:
 * - Automatically attaches JWT tokens to outgoing requests
 * - Skips authentication for public endpoints
 * - Handles 401 errors with automatic token refresh
 * - Retries failed requests after successful refresh
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);
  // Lazily resolve AuthService to break the circular dependency:
  // HttpClient → Interceptor → AuthService → HttpClient
  const authService = injector.get(AuthService);

  // Determine if this is a public endpoint
  const isPublicEndpoint = isPublic(req.url);

  // Only attach token for non-public endpoints.
  // Spring Security's gateway validates any JWT it receives — even on public
  // endpoints. If an expired/invalid token is sent to a public endpoint, the
  // gateway returns 401 instead of letting the request through unauthenticated.
  let authReq = req;
  const token = authService.getAccessToken();

  if (token && !isPublicEndpoint) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Don't attempt token refresh for auth endpoints (login, register, refresh)
      const isAuthEndpoint = req.url.includes('/api/users/login') || 
                             req.url.includes('/api/users/register') ||
                             req.url.includes('/api/users/refresh');
      
      // Handle 401 Unauthorized - attempt token refresh only for non-auth endpoints
      if (error.status === 401 && !isAuthEndpoint && authService.isLoggedIn()) {
        return authService.refreshToken().pipe(
          switchMap(() => {
            // Retry the request with new token
            const newToken = authService.getAccessToken();
            const retryReq = req.clone({
              setHeaders: {
                Authorization: `Bearer ${newToken}`
              }
            });
            return next(retryReq);
          }),
          catchError((refreshError) => {
            // Refresh failed, logout user
            authService.logout();
            return throwError(() => refreshError);
          })
        );
      }

      return throwError(() => error);
    })
  );
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if the URL is a public endpoint that doesn't require authentication
 */
function isPublic(url: string): boolean {
  // Extract path from URL
  const path = extractPath(url);

  // Check authenticated endpoints first (these are NEVER public)
  if (AUTHENTICATED_ENDPOINTS.some(endpoint => path.endsWith(endpoint))) {
    return false;
  }

  // Check exact matches
  if (PUBLIC_ENDPOINTS.some(endpoint => path.includes(endpoint))) {
    return true;
  }

  // Check pattern matches
  if (PUBLIC_PATTERNS.some(pattern => pattern.test(path))) {
    return true;
  }

  // /api/users/{username} is public (GET only for public profile)
  // but exclude known sub-paths like /me, /follow, /unfollow, /logout
  const userProfilePattern = /^\/api\/users\/[^/]+$/;
  const reservedUserPaths = ['me', 'login', 'register', 'refresh', 'logout', 'search'];
  if (userProfilePattern.test(path)) {
    const segment = path.split('/').pop() || '';
    if (!reservedUserPaths.includes(segment) && !segment.startsWith('follow') && !segment.startsWith('unfollow')) {
      return true;
    }
  }

  // All /api/movies/* GET requests are public (except watchlist)
  if (path.startsWith('/api/movies/') && !path.includes('watchlist')) {
    return true;
  }

  return false;
}

/**
 * Extract path from a full URL
 */
function extractPath(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname;
  } catch {
    // If URL parsing fails, assume it's already a path
    return url;
  }
}
