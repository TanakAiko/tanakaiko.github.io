import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, throwError, of } from 'rxjs';
import { tap, catchError, map, finalize, switchMap, filter, take } from 'rxjs/operators';
import { environment } from '../environments/environment';

// ============================================================================
// INTERFACES - Based on Backend API Documentation
// ============================================================================

/**
 * User profile returned from /api/users/me endpoint
 */
export interface UserProfile {
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  followersCount: number;
  followingCount: number;
}

/**
 * Extended user interface for UI purposes (includes avatar)
 */
export interface User extends UserProfile {
  avatar: string;
}

/**
 * Registration request payload
 */
export interface RegistrationRequest {
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  password: string;
}

/**
 * Login request payload
 */
export interface LoginRequest {
  username: string;
  password: string;
  totp?: string; // Optional TOTP code for 2FA-enabled accounts
}

/**
 * Token response from authentication endpoints
 */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
}

/**
 * 2FA status response
 */
export interface TwoFactorStatus {
  enabled: boolean;
}

/**
 * 2FA setup response (returned when enabling 2FA)
 */
export interface TwoFactorSetup {
  secret: string;
  otpAuthUri: string;
}

/**
 * Public user profile (visible to anyone)
 */
export interface PublicProfile {
  username: string;
  firstname: string;
  lastname: string;
  followersCount: number;
  followingCount: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE_URL = environment.apiBaseUrl;
const STORAGE_KEYS = {
  ACCESS_TOKEN: `${environment.auth.storagePrefix}access_token`,
  REFRESH_TOKEN: `${environment.auth.storagePrefix}refresh_token`,
  TOKEN_EXPIRY: `${environment.auth.storagePrefix}token_expiry`,
  USER_PROFILE: `${environment.auth.storagePrefix}user_profile`,
} as const;

// ============================================================================
// AUTH SERVICE
// ============================================================================

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // -------------------------------------------------------------------------
  // Dependency Injection (Angular 2026 Standard - inject() function)
  // -------------------------------------------------------------------------
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly apiUrl = `${API_BASE_URL}/api/users`;

  // -------------------------------------------------------------------------
  // State Management with Signals
  // -------------------------------------------------------------------------

  /** Current authenticated user profile */
  private readonly _currentUser = signal<User | null>(null);
  
  /** Whether the user is currently authenticated */
  private readonly _isLoggedIn = signal<boolean>(false);
  
  /** Loading state for async operations */
  private readonly _isLoading = signal<boolean>(false);
  
  /** Last authentication error */
  private readonly _error = signal<string | null>(null);

  // Public readonly signals
  readonly currentUser = this._currentUser.asReadonly();
  readonly isLoggedIn = this._isLoggedIn.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();

  // Computed signals
  readonly isAuthenticated = computed(() => this._isLoggedIn() && this._currentUser() !== null);
  readonly userDisplayName = computed(() => {
    const user = this._currentUser();
    if (!user) return '';
    return user.firstname && user.lastname 
      ? `${user.firstname} ${user.lastname}`.trim() 
      : user.username;
  });

  // Token refresh subject to prevent multiple simultaneous refresh attempts.
  // Empty string '' is used as a sentinel to signal refresh failure to waiting subscribers.
  private refreshTokenSubject = new BehaviorSubject<string | null>(null);
  private isRefreshing = false;

  constructor() {
    this.initializeAuthState();
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  /**
   * Initialize authentication state from localStorage on app startup
   */
  private initializeAuthState(): void {
    const token = this.getAccessToken();
    const storedUser = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    const expiry = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);

    if (token && storedUser && expiry) {
      const expiryTime = parseInt(expiry, 10);
      
      if (Date.now() < expiryTime) {
        try {
          const user = JSON.parse(storedUser) as User;
          this._currentUser.set(user);
          this._isLoggedIn.set(true);
          
          // Optionally refresh user profile in background
          this.fetchUserProfile().subscribe();
        } catch {
          this.clearAuthState();
        }
      } else {
        // Token expired, try to refresh
        // Temporarily restore user state while we attempt refresh
        try {
          const user = JSON.parse(storedUser) as User;
          this._currentUser.set(user);
          this._isLoggedIn.set(true);
        } catch {
          // ignore parse errors
        }
        this.refreshToken().pipe(
          switchMap(() => this.fetchUserProfile())
        ).subscribe({
          error: () => this.clearAuthState()
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Authentication Methods
  // -------------------------------------------------------------------------

  /**
   * Register a new user account
   */
  register(request: RegistrationRequest): Observable<string> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.post(`${this.apiUrl}/register`, request, { responseType: 'text' }).pipe(
      catchError((error) => {
        this._isLoading.set(false);
        return this.handleError(error, 'Registration failed');
      })
    );
  }

  /**
   * Login with username and password
   */
  login(request: LoginRequest): Observable<TokenResponse> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.post<TokenResponse>(`${this.apiUrl}/login`, request).pipe(
      tap((response) => {
        this.storeTokens(response);
        this._isLoggedIn.set(true);
      }),
      // Fetch user profile after successful login — wait for it to complete
      // so the profile is cached in localStorage before navigation occurs
      switchMap((tokenResponse) =>
        this.fetchUserProfile().pipe(
          // Profile fetch succeeded — return original token response
          map(() => tokenResponse),
          // Profile fetch failed — still allow login to succeed,
          // but log the error. Profile will be retried on next app load.
          catchError(() => of(tokenResponse))
        )
      ),
      catchError((error) => this.handleError(error, 'Login failed')),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Refresh the access token using the refresh token
   */
  refreshToken(): Observable<TokenResponse> {
    const refreshToken = this.getRefreshToken();

    if (!refreshToken) {
      this.clearAuthState();
      return throwError(() => new Error('No refresh token available'));
    }

    if (this.isRefreshing) {
      // Wait for the ongoing refresh to complete — skip the initial null
      return this.refreshTokenSubject.pipe(
        filter((token) => token !== null),
        take(1),
        switchMap((token) => {
          if (token === '') {
            // Empty string signals refresh failure
            return throwError(() => new Error('Token refresh failed'));
          }
          return of({ access_token: token } as TokenResponse);
        })
      );
    }

    this.isRefreshing = true;
    this.refreshTokenSubject.next(null);

    return this.http.post<TokenResponse>(`${this.apiUrl}/refresh`, { refreshToken }).pipe(
      tap((response) => {
        this.storeTokens(response);
        this.isRefreshing = false;
        this.refreshTokenSubject.next(response.access_token);
      }),
      catchError((error) => {
        this.isRefreshing = false;
        this.refreshTokenSubject.next(''); // Signal failure to waiting subscribers
        this.clearAuthState();
        this.router.navigate(['/auth']);
        return throwError(() => error);
      })
    );
  }

  /**
   * Logout the current user
   */
  logout(): void {
    const refreshToken = this.getRefreshToken();

    if (refreshToken) {
      // Attempt to invalidate the session on the server
      this.http.post(`${this.apiUrl}/logout`, { refreshToken }).pipe(
        catchError(() => of(null)) // Ignore errors during logout
      ).subscribe();
    }

    this.clearAuthState();
    this.router.navigate(['/auth']);
  }

  // -------------------------------------------------------------------------
  // User Profile Methods
  // -------------------------------------------------------------------------

  /**
   * Fetch the current user's profile from the server
   */
  fetchUserProfile(): Observable<User> {
    return this.http.get<UserProfile>(`${this.apiUrl}/me`).pipe(
      map((profile) => this.mapToUser(profile)),
      tap((user) => {
        this._currentUser.set(user);
        localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(user));
      }),
      catchError((error) => {
        if (error.status === 401) {
          this.clearAuthState();
        }
        return throwError(() => error);
      })
    );
  }

  /**
   * Get a public user profile by username
   */
  getPublicProfile(username: string): Observable<PublicProfile> {
    return this.http.get<PublicProfile>(`${this.apiUrl}/${username}`);
  }

  /**
   * Search for users by username or name
   */
  searchUsers(query: string): Observable<PublicProfile[]> {
    return this.http.get<PublicProfile[]>(`${this.apiUrl}/search`, {
      params: { q: query }
    });
  }

  // -------------------------------------------------------------------------
  // Social Methods
  // -------------------------------------------------------------------------

  /**
   * Follow a user
   */
  followUser(username: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/follow/${username}`, {});
  }

  /**
   * Unfollow a user
   */
  unfollowUser(username: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/unfollow/${username}`);
  }

  /**
   * Get a user's followers
   */
  getFollowers(username: string): Observable<PublicProfile[]> {
    return this.http.get<PublicProfile[]>(`${this.apiUrl}/${username}/followers`);
  }

  /**
   * Get users that a user is following
   */
  getFollowing(username: string): Observable<PublicProfile[]> {
    return this.http.get<PublicProfile[]>(`${this.apiUrl}/${username}/following`);
  }

  // -------------------------------------------------------------------------
  // Two-Factor Authentication (2FA) Methods
  // -------------------------------------------------------------------------

  /**
   * Check if the current user has 2FA enabled
   */
  get2FAStatus(): Observable<TwoFactorStatus> {
    return this.http.get<TwoFactorStatus>(`${this.apiUrl}/2fa/status`);
  }

  /**
   * Initiate 2FA setup — returns secret key and otpAuthUri for QR code
   * User must verify with a TOTP code after scanning to complete setup
   */
  enable2FA(): Observable<TwoFactorSetup> {
    return this.http.post<TwoFactorSetup>(`${this.apiUrl}/2fa/enable`, {});
  }

  /**
   * Verify a TOTP code to complete 2FA setup
   * Must be called after enable2FA() with a code from the authenticator app
   */
  verify2FA(code: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/2fa/verify`, { code });
  }

  /**
   * Disable 2FA for the current user
   */
  disable2FA(): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/2fa/disable`, {});
  }

  // -------------------------------------------------------------------------
  // Token Management
  // -------------------------------------------------------------------------

  /**
   * Get the current access token
   */
  getAccessToken(): string | null {
    return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  }

  /**
   * Get the current refresh token
   */
  getRefreshToken(): string | null {
    return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  }

  /**
   * Check if the current token is expired
   */
  isTokenExpired(): boolean {
    const expiry = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);
    if (!expiry) return true;
    return Date.now() >= parseInt(expiry, 10);
  }

  // -------------------------------------------------------------------------
  // Private Helper Methods
  // -------------------------------------------------------------------------

  /**
   * Store tokens in localStorage
   */
  private storeTokens(response: TokenResponse): void {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, response.access_token);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, response.refresh_token);
    
    // Calculate token expiry time (subtract 30 seconds buffer)
    const expiryTime = Date.now() + (response.expires_in - 30) * 1000;
    localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, expiryTime.toString());
  }

  /**
   * Clear all authentication state
   */
  private clearAuthState(): void {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
    
    this._currentUser.set(null);
    this._isLoggedIn.set(false);
    this._error.set(null);
  }

  /**
   * Map UserProfile to User (adds avatar URL)
   */
  private mapToUser(profile: UserProfile): User {
    return {
      ...profile,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${profile.username}&backgroundColor=6366f1`
    };
  }

  /**
   * Handle HTTP errors and set error state
   */
  private handleError(error: HttpErrorResponse, defaultMessage: string): Observable<never> {
    let errorMessage = defaultMessage;

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = error.error.message;
    } else if (typeof error.error === 'string') {
      // Server returned error message
      errorMessage = error.error;
    } else if (error.error?.message) {
      errorMessage = error.error.message;
    } else {
      // Map HTTP status codes to user-friendly messages
      switch (error.status) {
        case 400:
          errorMessage = 'Invalid request. Please check your input.';
          break;
        case 401:
          errorMessage = 'Invalid credentials. Please try again.';
          break;
        case 403:
          errorMessage = 'Access denied.';
          break;
        case 404:
          errorMessage = 'User not found.';
          break;
        case 409:
          errorMessage = 'Username or email already exists.';
          break;
        case 500:
          errorMessage = 'Server error. Please try again later.';
          break;
      }
    }

    this._error.set(errorMessage);
    return throwError(() => new Error(errorMessage));
  }

  // -------------------------------------------------------------------------
  // Utility Methods
  // -------------------------------------------------------------------------

  /**
   * Clear the current error
   */
  clearError(): void {
    this._error.set(null);
  }

  /**
   * Check if password meets requirements
   */
  validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one digit');
    }
    if (!/[@$!%*?&]/.test(password)) {
      errors.push('Password must contain at least one special character (@$!%*?&)');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}