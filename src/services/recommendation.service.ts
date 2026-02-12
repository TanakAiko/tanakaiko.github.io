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
 * Recommendation from the recommendation engine
 */
export interface Recommendation {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  overview: string;
  voteAverage: number;
  releaseYear: number;
  reason: string; // e.g., "Popular among users who liked Inception"
}

/**
 * Share recommendation request
 */
export interface ShareRequest {
  tmdbId: number;
  recipientUsername: string;
  message?: string;
}

/**
 * Shared recommendation (received or sent)
 */
export interface SharedRecommendation {
  // Movie info
  tmdbId: number;
  title: string;
  posterPath: string | null;
  overview: string;
  voteAverage: number;
  releaseYear: number;
  // Share info
  fromUsername: string;
  toUsername: string;
  message: string;
  sharedAt: string;
}

/**
 * Recommendation display model with full image URLs
 */
export interface RecommendationDisplay extends Recommendation {
  poster: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE_URL = environment.apiBaseUrl;
const TMDB_IMAGE_BASE_URL = environment.tmdbImageBaseUrl;
const POSTER_SIZE = environment.tmdbPosterSize;

const PLACEHOLDER_POSTER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750"><rect fill="%231a1f26" width="500" height="750"/><text fill="%23666" font-family="sans-serif" font-size="24" text-anchor="middle" x="250" y="375">No Poster</text></svg>')}`;

// ============================================================================
// RECOMMENDATION SERVICE
// ============================================================================

@Injectable({
  providedIn: 'root'
})
export class RecommendationService {
  // -------------------------------------------------------------------------
  // Dependency Injection (Angular 2026 Standard)
  // -------------------------------------------------------------------------
  private readonly http = inject(HttpClient);
  private readonly notificationService = inject(NotificationService);
  private readonly apiUrl = `${API_BASE_URL}/api/recommendations`;

  // -------------------------------------------------------------------------
  // State Management with Signals
  // -------------------------------------------------------------------------

  /** Personalized recommendations */
  private readonly _recommendations = signal<Recommendation[]>([]);
  
  /** Recommendations received from other users */
  private readonly _receivedShares = signal<SharedRecommendation[]>([]);
  
  /** Recommendations sent to other users */
  private readonly _sentShares = signal<SharedRecommendation[]>([]);
  
  /** Loading state */
  private readonly _isLoading = signal<boolean>(false);
  
  /** Error state */
  private readonly _error = signal<string | null>(null);

  // Public readonly signals
  readonly recommendations = this._recommendations.asReadonly();
  readonly receivedShares = this._receivedShares.asReadonly();
  readonly sentShares = this._sentShares.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();

  // Computed: Recommendations with full image URLs
  readonly recommendationsDisplay = computed(() => 
    this._recommendations().map(r => this.toRecommendationDisplay(r))
  );

  // Computed: Unread received shares count
  readonly receivedCount = computed(() => this._receivedShares().length);

  // -------------------------------------------------------------------------
  // API Methods
  // -------------------------------------------------------------------------

  /**
   * Fetch personalized recommendations for the current user
   */
  fetchRecommendations(): Observable<Recommendation[]> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<Recommendation[]>(this.apiUrl).pipe(
      tap((recommendations) => this._recommendations.set(recommendations)),
      catchError((error) => {
        this._error.set('Failed to fetch recommendations');
        console.error('Recommendations fetch error:', error);
        return of([]);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Share a movie recommendation with another user
   */
  shareRecommendation(tmdbId: number, recipientUsername: string, message?: string): Observable<void> {
    this._isLoading.set(true);
    this._error.set(null);

    const request: ShareRequest = {
      tmdbId,
      recipientUsername,
      message: message || ''
    };

    return this.http.post<void>(`${this.apiUrl}/share`, request).pipe(
      tap(() => {
        this.notificationService.success(`Recommendation sent to ${recipientUsername}!`);
        // Refresh sent shares
        this.fetchSentShares().subscribe();
      }),
      catchError((error) => {
        this._error.set('Failed to share recommendation');
        this.notificationService.error('Failed to send recommendation');
        console.error('Share recommendation error:', error);
        return throwError(() => error);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Fetch recommendations received from other users
   */
  fetchReceivedShares(): Observable<SharedRecommendation[]> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<SharedRecommendation[]>(`${this.apiUrl}/shared/received`).pipe(
      tap((shares) => this._receivedShares.set(shares)),
      catchError((error) => {
        this._error.set('Failed to fetch received recommendations');
        console.error('Received shares fetch error:', error);
        return of([]);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Fetch recommendations sent to other users
   */
  fetchSentShares(): Observable<SharedRecommendation[]> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<SharedRecommendation[]>(`${this.apiUrl}/shared/sent`).pipe(
      tap((shares) => this._sentShares.set(shares)),
      catchError((error) => {
        this._error.set('Failed to fetch sent recommendations');
        console.error('Sent shares fetch error:', error);
        return of([]);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------

  /**
   * Get full poster image URL from TMDB path
   */
  getPosterUrl(path: string | null | undefined): string {
    if (!path) return PLACEHOLDER_POSTER;
    return `${TMDB_IMAGE_BASE_URL}/${POSTER_SIZE}${path}`;
  }

  /**
   * Convert Recommendation to RecommendationDisplay
   */
  private toRecommendationDisplay(rec: Recommendation): RecommendationDisplay {
    return {
      ...rec,
      poster: this.getPosterUrl(rec.posterPath),
    };
  }

  // -------------------------------------------------------------------------
  // State Management Methods
  // -------------------------------------------------------------------------

  /**
   * Clear all recommendation state (e.g., on logout)
   */
  clearAll(): void {
    this._recommendations.set([]);
    this._receivedShares.set([]);
    this._sentShares.set([]);
    this._error.set(null);
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this._error.set(null);
  }
}
