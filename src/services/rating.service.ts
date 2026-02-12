import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { tap, catchError, finalize, map } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { NotificationService } from './notification.service';

// ============================================================================
// INTERFACES - Based on Backend API Documentation
// ============================================================================

/**
 * Rating request payload
 */
export interface RatingRequest {
  tmdbId: number;
  score: number; // 1-5
  comment?: string; // Optional comment (if backend supports it)
}

/**
 * User rating response
 */
export interface UserRating {
  tmdbId: number;
  title: string;
  posterPath: string;
  score: number;
  comment?: string;
  ratedDate: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE_URL = environment.apiBaseUrl;

// ============================================================================
// RATING SERVICE
// ============================================================================

@Injectable({
  providedIn: 'root'
})
export class RatingService {
  // -------------------------------------------------------------------------
  // Dependency Injection (Angular 2026 Standard)
  // -------------------------------------------------------------------------
  private readonly http = inject(HttpClient);
  private readonly notificationService = inject(NotificationService);
  private readonly apiUrl = `${API_BASE_URL}/api/ratings`;

  // -------------------------------------------------------------------------
  // State Management with Signals
  // -------------------------------------------------------------------------

  /** User's ratings */
  private readonly _userRatings = signal<UserRating[]>([]);
  
  /** Map of movie tmdbId to rating score for quick lookup */
  private readonly _ratingsMap = signal<Map<number, number>>(new Map());
  
  /** Loading state */
  private readonly _isLoading = signal<boolean>(false);
  
  /** Error state */
  private readonly _error = signal<string | null>(null);

  // Public readonly signals
  readonly userRatings = this._userRatings.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();

  // Computed: Ratings count
  readonly count = computed(() => this._userRatings().length);

  // -------------------------------------------------------------------------
  // API Methods
  // -------------------------------------------------------------------------

  /**
   * Fetch all ratings for the current user
   */
  fetchUserRatings(): Observable<UserRating[]> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<UserRating[]>(this.apiUrl).pipe(
      tap((ratings) => {
        this._userRatings.set(ratings);
        // Build lookup map
        const map = new Map<number, number>();
        ratings.forEach(r => map.set(r.tmdbId, r.score));
        this._ratingsMap.set(map);
      }),
      catchError((error) => {
        this._error.set('Failed to fetch ratings');
        console.error('Ratings fetch error:', error);
        return of([]);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Submit or update a movie rating (1-5 stars)
   */
  rateMovie(tmdbId: number, score: number, comment?: string): Observable<void> {
    if (score < 1 || score > 5) {
      this._error.set('Rating must be between 1 and 5');
      this.notificationService.error('Rating must be between 1 and 5');
      return of(undefined);
    }

    this._isLoading.set(true);
    this._error.set(null);

    const request: RatingRequest = { tmdbId, score };
    if (comment) {
      request.comment = comment;
    }

    return this.http.post<void>(this.apiUrl, request).pipe(
      tap(() => {
        // Update local state
        this._ratingsMap.update(map => {
          const newMap = new Map(map);
          newMap.set(tmdbId, score);
          return newMap;
        });
        this.notificationService.success('Rating submitted!');
        // Refresh ratings to get updated data
        this.fetchUserRatings().subscribe();
      }),
      catchError((error) => {
        this._error.set('Failed to submit rating');
        this.notificationService.error('Failed to submit rating');
        console.error('Rate movie error:', error);
        return throwError(() => error);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Delete a rating by TMDB ID
   */
  deleteRating(tmdbId: number): Observable<void> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.delete<void>(`${this.apiUrl}/${tmdbId}`).pipe(
      tap(() => {
        // Update local state
        this._userRatings.update(ratings => 
          ratings.filter(r => r.tmdbId !== tmdbId)
        );
        this._ratingsMap.update(map => {
          const newMap = new Map(map);
          newMap.delete(tmdbId);
          return newMap;
        });
        this.notificationService.success('Rating removed');
      }),
      catchError((error) => {
        this._error.set('Failed to delete rating');
        this.notificationService.error('Failed to remove rating');
        console.error('Delete rating error:', error);
        return throwError(() => error);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Get user's rating for a specific movie
   */
  getUserRating(tmdbId: number): Observable<number | null> {
    return this.http.get<number>(`${this.apiUrl}/movie/${tmdbId}`).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Get average rating for a movie (public, no auth required)
   */
  getAverageRating(tmdbId: number): Observable<number | null> {
    return this.http.get<number>(`${this.apiUrl}/movie/${tmdbId}/average`).pipe(
      catchError(() => of(null))
    );
  }

  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------

  /**
   * Get cached rating for a movie (from local state)
   */
  getCachedRating(tmdbId: number): number | undefined {
    return this._ratingsMap().get(tmdbId);
  }

  /**
   * Check if user has rated a movie
   */
  hasRated(tmdbId: number): boolean {
    return this._ratingsMap().has(tmdbId);
  }

  // -------------------------------------------------------------------------
  // State Management Methods
  // -------------------------------------------------------------------------

  /**
   * Clear ratings state (e.g., on logout)
   */
  clearRatings(): void {
    this._userRatings.set([]);
    this._ratingsMap.set(new Map());
    this._error.set(null);
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this._error.set(null);
  }
}
