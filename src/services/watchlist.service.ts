import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { tap, catchError, finalize } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { NotificationService } from './notification.service';
import { MovieSummary } from './movie.service';

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE_URL = environment.apiBaseUrl;

// ============================================================================
// WATCHLIST SERVICE
// ============================================================================

@Injectable({
  providedIn: 'root'
})
export class WatchlistService {
  // -------------------------------------------------------------------------
  // Dependency Injection (Angular 2026 Standard)
  // -------------------------------------------------------------------------
  private readonly http = inject(HttpClient);
  private readonly notificationService = inject(NotificationService);
  private readonly apiUrl = `${API_BASE_URL}/api/movies`;

  // -------------------------------------------------------------------------
  // State Management with Signals
  // -------------------------------------------------------------------------

  /** User's watchlist movies */
  private readonly _watchlistMovies = signal<MovieSummary[]>([]);
  
  /** Set of movie IDs in watchlist for quick lookup */
  private readonly _watchlistIds = signal<Set<number>>(new Set());
  
  /** Loading state */
  private readonly _isLoading = signal<boolean>(false);
  
  /** Error state */
  private readonly _error = signal<string | null>(null);

  // Public readonly signals
  readonly watchlistMovies = this._watchlistMovies.asReadonly();
  readonly watchlistIds = this._watchlistIds.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();

  // Computed: Watchlist count
  readonly count = computed(() => this._watchlistMovies().length);

  // Computed: Is watchlist empty
  readonly isEmpty = computed(() => this._watchlistMovies().length === 0);

  // -------------------------------------------------------------------------
  // API Methods
  // -------------------------------------------------------------------------

  /**
   * Fetch user's watchlist from the backend
   */
  fetchWatchlist(): Observable<MovieSummary[]> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<MovieSummary[]>(`${this.apiUrl}/watchlist`).pipe(
      tap((movies) => {
        this._watchlistMovies.set(movies);
        this._watchlistIds.set(new Set(movies.map(m => m.tmdbId)));
      }),
      catchError((error) => {
        this._error.set('Failed to fetch watchlist');
        console.error('Watchlist fetch error:', error);
        return of([]);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Add a movie to watchlist by TMDB ID
   */
  addToWatchlist(tmdbId: number): Observable<void> {
    // Optimistic update
    this._watchlistIds.update(ids => new Set([...ids, tmdbId]));

    return this.http.post<void>(`${this.apiUrl}/${tmdbId}/watchlist`, {}).pipe(
      tap(() => {
        this.notificationService.success('Added to watchlist');
        // Refresh watchlist to get full movie data
        this.fetchWatchlist().subscribe();
      }),
      catchError((error) => {
        // Revert optimistic update
        this._watchlistIds.update(ids => {
          const newIds = new Set(ids);
          newIds.delete(tmdbId);
          return newIds;
        });
        this._error.set('Failed to add to watchlist');
        this.notificationService.error('Failed to add to watchlist');
        console.error('Add to watchlist error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Remove a movie from watchlist by TMDB ID
   */
  removeFromWatchlist(tmdbId: number): Observable<void> {
    // Optimistic update
    const previousMovies = this._watchlistMovies();
    this._watchlistMovies.update(movies => movies.filter(m => m.tmdbId !== tmdbId));
    this._watchlistIds.update(ids => {
      const newIds = new Set(ids);
      newIds.delete(tmdbId);
      return newIds;
    });

    return this.http.delete<void>(`${this.apiUrl}/${tmdbId}/watchlist`).pipe(
      tap(() => {
        this.notificationService.success('Removed from watchlist');
      }),
      catchError((error) => {
        // Revert optimistic update
        this._watchlistMovies.set(previousMovies);
        this._watchlistIds.set(new Set(previousMovies.map(m => m.tmdbId)));
        this._error.set('Failed to remove from watchlist');
        this.notificationService.error('Failed to remove from watchlist');
        console.error('Remove from watchlist error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Check if a movie is in the watchlist by TMDB ID
   */
  isInWatchlist(tmdbId: number): boolean {
    return this._watchlistIds().has(tmdbId);
  }

  /**
   * Toggle watchlist status by TMDB ID
   */
  toggleWatchlist(tmdbId: number): Observable<void> {
    if (this.isInWatchlist(tmdbId)) {
      return this.removeFromWatchlist(tmdbId);
    } else {
      return this.addToWatchlist(tmdbId);
    }
  }

  // -------------------------------------------------------------------------
  // State Management Methods
  // -------------------------------------------------------------------------

  /**
   * Clear watchlist state (e.g., on logout)
   */
  clearWatchlist(): void {
    this._watchlistMovies.set([]);
    this._watchlistIds.set(new Set());
    this._error.set(null);
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this._error.set(null);
  }
}
