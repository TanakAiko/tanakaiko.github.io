import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { tap, catchError, finalize, map } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { NotificationService } from './notification.service';
import { PublicProfile, AuthService } from './auth.service';

// ============================================================================
// INTERFACES - Based on Backend API Documentation
// ============================================================================

/**
 * User with computed properties for UI
 */
export interface UserDisplay extends PublicProfile {
  avatar: string;
  displayName: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE_URL = environment.apiBaseUrl;

// ============================================================================
// USER SERVICE
// ============================================================================

@Injectable({
  providedIn: 'root'
})
export class UserService {
  // -------------------------------------------------------------------------
  // Dependency Injection (Angular 2026 Standard)
  // -------------------------------------------------------------------------
  private readonly http = inject(HttpClient);
  private readonly notificationService = inject(NotificationService);
  private readonly apiUrl = `${API_BASE_URL}/api/users`;
  private readonly authService = inject(AuthService);

  // -------------------------------------------------------------------------
  // State Management with Signals
  // -------------------------------------------------------------------------

  /** Currently viewed user profile */
  private readonly _viewedProfile = signal<UserDisplay | null>(null);
  
  /** User's followers list */
  private readonly _followers = signal<UserDisplay[]>([]);
  
  /** User's following list */
  private readonly _following = signal<UserDisplay[]>([]);
  
  /** Search results */
  private readonly _searchResults = signal<UserDisplay[]>([]);

  /** All registered users (community list) */
  private readonly _allUsers = signal<UserDisplay[]>([]);
  
  /** Loading state */
  private readonly _isLoading = signal<boolean>(false);
  
  /** Error state */
  private readonly _error = signal<string | null>(null);

  // Public readonly signals
  readonly viewedProfile = this._viewedProfile.asReadonly();
  readonly followers = this._followers.asReadonly();
  readonly following = this._following.asReadonly();
  readonly searchResults = this._searchResults.asReadonly();
  readonly allUsers = this._allUsers.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();

  // -------------------------------------------------------------------------
  // API Methods
  // -------------------------------------------------------------------------

  /**
   * Get any user's public profile by username
   */
  getPublicProfile(username: string): Observable<UserDisplay> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<PublicProfile>(`${this.apiUrl}/${username}`).pipe(
      map(profile => this.toUserDisplay(profile)),
      tap((profile) => this._viewedProfile.set(profile)),
      catchError((error) => {
        this._error.set('Failed to load user profile');
        console.error('Profile fetch error:', error);
        return throwError(() => error);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Search users by username or name
   */
  searchUsers(query: string): Observable<UserDisplay[]> {
    if (!query.trim()) {
      this._searchResults.set([]);
      return of([]);
    }

    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<PublicProfile[]>(`${this.apiUrl}/search`, {
      params: { q: query }
    }).pipe(
      map(profiles => profiles.map(p => this.toUserDisplay(p))),
      tap((profiles) => this._searchResults.set(profiles)),
      catchError((error) => {
        this._error.set('Search failed');
        console.error('User search error:', error);
        return of([]);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * List all registered users (for community discovery)
   */
  listAllUsers(limit: number = 50): Observable<UserDisplay[]> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<PublicProfile[]>(`${this.apiUrl}/all`, {
      params: { limit: limit.toString() }
    }).pipe(
      map(profiles => profiles.map(p => this.toUserDisplay(p))),
      tap((profiles) => this._allUsers.set(profiles)),
      catchError((error) => {
        this._error.set('Failed to load users');
        console.error('List all users error:', error);
        return of([]);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Get a user's followers
   */
  getFollowers(username: string): Observable<UserDisplay[]> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<PublicProfile[]>(`${this.apiUrl}/${username}/followers`).pipe(
      map(profiles => profiles.map(p => this.toUserDisplay(p))),
      tap((profiles) => this._followers.set(profiles)),
      catchError((error) => {
        this._error.set('Failed to load followers');
        console.error('Followers fetch error:', error);
        return of([]);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Get users that a user is following
   */
  getFollowing(username: string): Observable<UserDisplay[]> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<PublicProfile[]>(`${this.apiUrl}/${username}/following`).pipe(
      map(profiles => profiles.map(p => this.toUserDisplay(p))),
      tap((profiles) => this._following.set(profiles)),
      catchError((error) => {
        this._error.set('Failed to load following list');
        console.error('Following fetch error:', error);
        return of([]);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Follow a user (authenticated)
   */
  followUser(username: string): Observable<void> {
    this._isLoading.set(true);

    return this.http.post<void>(`${this.apiUrl}/follow/${username}`, {}).pipe(
      tap(() => {
        this.notificationService.success(`You are now following ${username}`);
        // Refresh current user's profile to update counts
        this.authService.fetchUserProfile().subscribe();
      }),
      catchError((error) => {
        this.notificationService.error('Failed to follow user');
        console.error('Follow error:', error);
        return throwError(() => error);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Unfollow a user (authenticated)
   */
  unfollowUser(username: string): Observable<void> {
    this._isLoading.set(true);

    return this.http.delete<void>(`${this.apiUrl}/unfollow/${username}`).pipe(
      tap(() => {
        this.notificationService.success(`You unfollowed ${username}`);
        // Refresh current user's profile to update counts
        this.authService.fetchUserProfile().subscribe();
      }),
      catchError((error) => {
        this.notificationService.error('Failed to unfollow user');
        console.error('Unfollow error:', error);
        return throwError(() => error);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------

  /**
   * Clear viewed profile (e.g., on page leave)
   */
  clearViewedProfile(): void {
    this._viewedProfile.set(null);
    this._followers.set([]);
    this._following.set([]);
  }

  /**
   * Clear search results
   */
  clearSearchResults(): void {
    this._searchResults.set([]);
  }

  /**
   * Convert PublicProfile to UserDisplay with avatar
   */
  private toUserDisplay(profile: PublicProfile): UserDisplay {
    return {
      ...profile,
      avatar: this.generateAvatar(profile.username),
      displayName: `${profile.firstname} ${profile.lastname}`.trim() || profile.username,
    };
  }

  /**
   * Generate avatar URL from username
   */
  private generateAvatar(username: string): string {
    // Use a deterministic avatar service
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username)}&backgroundColor=00a8c5`;
  }
}
