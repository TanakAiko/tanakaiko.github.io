import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, forkJoin, throwError } from 'rxjs';
import { tap, catchError, finalize } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { NotificationService } from './notification.service';

// ============================================================================
// INTERFACES - Based on Backend API Documentation
// ============================================================================

/**
 * Movie summary for list views (from /api/movies/trending, /popular, /search)
 */
export interface MovieSummary {
  tmdbId: number;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath?: string | null;
  voteAverage: number;
  releaseYear: number;
  genres: string[];
}

/**
 * Full movie details (from /api/movies/{tmdbId})
 */
export interface MovieDetails {
  tmdbId: number;
  title: string;
  overview: string;
  releaseDate: string;
  runtime: number;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  genres: string[];
  directors: Person[];
  cast: Person[];
}

/**
 * Person (actor/director)
 */
export interface Person {
  tmdbId: number;
  name: string;
  profilePath: string | null;
}

/**
 * Movie display model with full image URLs (for UI components)
 */
export interface MovieDisplay {
  tmdbId: number;
  title: string;
  year: number;
  genres: string[];
  rating: number;
  description: string;
  duration: string;
  poster: string;
  backdrop: string;
  directors: PersonDisplay[];
  cast: PersonDisplay[];
}

/**
 * Person display model with full image URL
 */
export interface PersonDisplay {
  tmdbId: number;
  name: string;
  profileImage: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE_URL = environment.apiBaseUrl;
const TMDB_IMAGE_BASE_URL = environment.tmdbImageBaseUrl;
const POSTER_SIZE = environment.tmdbPosterSize;
const BACKDROP_SIZE = environment.tmdbBackdropSize;
const PROFILE_SIZE = environment.tmdbProfileSize;

// Placeholder images (inline SVG data URIs — no external dependency)
const PLACEHOLDER_POSTER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750"><rect fill="%231a1f26" width="500" height="750"/><text fill="%23666" font-family="sans-serif" font-size="24" text-anchor="middle" x="250" y="375">No Poster</text></svg>')}`;
const PLACEHOLDER_BACKDROP = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect fill="%231a1f26" width="1280" height="720"/><text fill="%23666" font-family="sans-serif" font-size="32" text-anchor="middle" x="640" y="360">No Backdrop</text></svg>')}`;
const PLACEHOLDER_PROFILE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="185" height="278" viewBox="0 0 185 278"><rect fill="%231a1f26" width="185" height="278"/><text fill="%23666" font-family="sans-serif" font-size="16" text-anchor="middle" x="92" y="139">No Photo</text></svg>')}`;

// ============================================================================
// MOVIE SERVICE
// ============================================================================

@Injectable({
  providedIn: 'root'
})
export class MovieService {
  // -------------------------------------------------------------------------
  // Dependency Injection (Angular 2026 Standard)
  // -------------------------------------------------------------------------
  private readonly http = inject(HttpClient);
  private readonly notificationService = inject(NotificationService);
  private readonly apiUrl = `${API_BASE_URL}/api/movies`;

  // Create a helper method to generate the headers
  private getHeaders() {
    return new HttpHeaders({
      'ngrok-skip-browser-warning': 'true',
      'Content-Type': 'application/json'
    });
  }

  // -------------------------------------------------------------------------
  // State Management with Signals
  // -------------------------------------------------------------------------

  /** Trending movies */
  private readonly _trendingMovies = signal<MovieSummary[]>([]);
  
  /** Popular movies */
  private readonly _popularMovies = signal<MovieSummary[]>([]);
  
  /** Search results */
  private readonly _searchResults = signal<MovieSummary[]>([]);

  /** Random movies */
  private readonly _randomMovies = signal<MovieSummary[]>([]);
  
  /** Currently selected movie details */
  private readonly _selectedMovie = signal<MovieDetails | null>(null);
  
  /** Similar movies for the selected movie */
  private readonly _similarMovies = signal<MovieSummary[]>([]);
  
  /** Loading state */
  private readonly _isLoading = signal<boolean>(false);
  
  /** Error state */
  private readonly _error = signal<string | null>(null);

  // Public readonly signals
  readonly trendingMovies = this._trendingMovies.asReadonly();
  readonly popularMovies = this._popularMovies.asReadonly();
  readonly searchResults = this._searchResults.asReadonly();
  readonly randomMovies = this._randomMovies.asReadonly();
  readonly selectedMovie = this._selectedMovie.asReadonly();
  readonly similarMovies = this._similarMovies.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();

  // Computed: All movies combined for browsing
  readonly allMovies = computed(() => {
    const trending = this._trendingMovies();
    const popular = this._popularMovies();
    // Combine and deduplicate by tmdbId
    const combined = [...trending, ...popular];
    const unique = combined.filter((movie, index, self) => 
      index === self.findIndex(m => m.tmdbId === movie.tmdbId)
    );
    return unique;
  });

  // Computed: Selected movie as display model
  readonly selectedMovieDisplay = computed(() => {
    const movie = this._selectedMovie();
    return movie ? this.toMovieDisplay(movie) : null;
  });

  // -------------------------------------------------------------------------
  // API Methods - Backend Integration
  // -------------------------------------------------------------------------

  /**
   * Fetch trending movies from the backend
   */
  fetchTrendingMovies(): Observable<MovieSummary[]> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<MovieSummary[]>(`${this.apiUrl}/trending`, { headers: this.getHeaders() }).pipe(
      tap((movies) => this._trendingMovies.set(movies)),
      catchError((error) => {
        this._error.set('Failed to fetch trending movies');
        this.notificationService.error('Failed to load trending movies');
        console.error('Trending movies error:', error);
        return of([]);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Fetch popular movies from the backend
   */
  fetchPopularMovies(): Observable<MovieSummary[]> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<MovieSummary[]>(`${this.apiUrl}/popular`, { headers: this.getHeaders() }).pipe(
      tap((movies) => this._popularMovies.set(movies)),
      catchError((error) => {
        this._error.set('Failed to fetch popular movies');
        this.notificationService.error('Failed to load popular movies');
        console.error('Popular movies error:', error);
        return of([]);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Fetch random movies from the backend
   */
  fetchRandomMovies(count: number = 10): Observable<MovieSummary[]> {
    return this.http.get<MovieSummary[]>(`${this.apiUrl}/random`, {
      headers: this.getHeaders(),
      params: { count: count.toString() }
    }).pipe(
      tap((movies) => this._randomMovies.set(movies)),
      catchError((error) => {
        console.error('Random movies error:', error);
        return of([]);
      })
    );
  }

  /**
   * Fetch both trending and popular movies
   */
  fetchAllMovies(): Observable<[MovieSummary[], MovieSummary[]]> {
    this._isLoading.set(true);
    this._error.set(null);

    return forkJoin([
      this.http.get<MovieSummary[]>(`${this.apiUrl}/trending`, { headers: this.getHeaders() }),
      this.http.get<MovieSummary[]>(`${this.apiUrl}/popular`, { headers: this.getHeaders() })
    ]).pipe(
      tap(([trending, popular]) => {
        this._trendingMovies.set(trending);
        this._popularMovies.set(popular);
      }),
      catchError((error) => {
        this._error.set('Failed to fetch movies');
        this.notificationService.error('Failed to load movies');
        console.error('Fetch all movies error:', error);
        return of([[], []] as [MovieSummary[], MovieSummary[]]);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Search movies by title
   */
  searchMovies(title: string): Observable<MovieSummary[]> {
    if (!title.trim()) {
      this._searchResults.set([]);
      return of([]);
    }

    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<MovieSummary[]>(`${this.apiUrl}/search`, {
      headers: this.getHeaders(),
      params: { title }
    }).pipe(
      tap((movies) => this._searchResults.set(movies)),
      catchError((error) => {
        this._error.set('Failed to search movies');
        console.error('Search movies error:', error);
        return of([]);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Get full movie details by TMDB ID
   */
  getMovieDetails(tmdbId: number): Observable<MovieDetails> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.http.get<MovieDetails>(`${this.apiUrl}/${tmdbId}`, { headers: this.getHeaders() }).pipe(
      tap((movie) => this._selectedMovie.set(movie)),
      catchError((error) => {
        this._error.set('Failed to fetch movie details');
        this.notificationService.error('Failed to load movie details');
        console.error('Movie details error:', error);
        return throwError(() => error);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  /**
   * Get similar movies by TMDB ID
   */
  getSimilarMovies(tmdbId: number): Observable<MovieSummary[]> {
    return this.http.get<MovieSummary[]>(`${this.apiUrl}/${tmdbId}/similar`, { headers: this.getHeaders() }).pipe(
      tap((movies) => this._similarMovies.set(movies)),
      catchError((error) => {
        console.error('Failed to fetch similar movies:', error);
        return of([]);
      })
    );
  }

  /**
   * Get movie details and similar movies together
   */
  getMovieWithSimilar(tmdbId: number): Observable<{ movie: MovieDetails; similar: MovieSummary[] }> {
    this._isLoading.set(true);

    return forkJoin({
      movie: this.http.get<MovieDetails>(`${this.apiUrl}/${tmdbId}`, { headers: this.getHeaders() }),
      similar: this.http.get<MovieSummary[]>(`${this.apiUrl}/${tmdbId}/similar`, { headers: this.getHeaders() }).pipe(
        catchError(() => of([]))
      )
    }).pipe(
      tap(({ movie, similar }) => {
        this._selectedMovie.set(movie);
        this._similarMovies.set(similar);
      }),
      catchError((error) => {
        this._error.set('Failed to fetch movie');
        this.notificationService.error('Failed to load movie details');
        return throwError(() => error);
      }),
      finalize(() => this._isLoading.set(false))
    );
  }

  // -------------------------------------------------------------------------
  // Image URL Helper Methods
  // -------------------------------------------------------------------------

  /**
   * Get full poster image URL from TMDB path
   */
  getPosterUrl(path: string | null | undefined): string {
    if (!path) return PLACEHOLDER_POSTER;
    return `${TMDB_IMAGE_BASE_URL}/${POSTER_SIZE}${path}`;
  }

  /**
   * Get full backdrop image URL from TMDB path
   */
  getBackdropUrl(path: string | null | undefined): string {
    if (!path) return PLACEHOLDER_BACKDROP;
    return `${TMDB_IMAGE_BASE_URL}/${BACKDROP_SIZE}${path}`;
  }

  /**
   * Get full profile image URL from TMDB path
   */
  getProfileUrl(path: string | null | undefined): string {
    if (!path) return PLACEHOLDER_PROFILE;
    return `${TMDB_IMAGE_BASE_URL}/${PROFILE_SIZE}${path}`;
  }

  // -------------------------------------------------------------------------
  // Conversion Methods
  // -------------------------------------------------------------------------

  /**
   * Convert MovieDetails to MovieDisplay for UI components
   */
  toMovieDisplay(movie: MovieDetails): MovieDisplay {
    return {
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : 0,
      genres: movie.genres || [],
      rating: Math.round(movie.voteAverage * 10) / 10 / 2, // Convert 10-scale to 5-scale
      description: movie.overview,
      duration: this.formatRuntime(movie.runtime),
      poster: this.getPosterUrl(movie.posterPath),
      backdrop: this.getBackdropUrl(movie.backdropPath),
      directors: (movie.directors || []).map(p => this.toPersonDisplay(p)),
      cast: (movie.cast || []).map(p => this.toPersonDisplay(p)),
    };
  }

  /**
   * Convert MovieSummary to a simpler display format
   */
  toSummaryDisplay(movie: MovieSummary): { tmdbId: number; title: string; poster: string; backdrop: string; rating: number; year: number; description: string; genres: string[] } {
    return {
      tmdbId: movie.tmdbId,
      title: movie.title,
      poster: this.getPosterUrl(movie.posterPath),
      backdrop: this.getBackdropUrl(movie.backdropPath),
      rating: Math.round(movie.voteAverage * 10) / 10 / 2,
      year: movie.releaseYear,
      description: movie.overview,
      genres: movie.genres || [],
    };
  }

  /**
   * Convert Person to PersonDisplay
   */
  private toPersonDisplay(person: Person): PersonDisplay {
    return {
      tmdbId: person.tmdbId,
      name: person.name,
      profileImage: this.getProfileUrl(person.profilePath),
    };
  }

  /**
   * Format runtime minutes to human-readable string
   */
  private formatRuntime(minutes: number | null | undefined): string {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  }

  // -------------------------------------------------------------------------
  // State Management Methods
  // -------------------------------------------------------------------------

  /**
   * Clear search results
   */
  clearSearch(): void {
    this._searchResults.set([]);
  }

  /**
   * Clear selected movie
   */
  clearSelectedMovie(): void {
    this._selectedMovie.set(null);
    this._similarMovies.set([]);
  }

  /**
   * Clear all movie data
   */
  clearAll(): void {
    this._trendingMovies.set([]);
    this._popularMovies.set([]);
    this._searchResults.set([]);
    this._randomMovies.set([]);
    this._selectedMovie.set(null);
    this._similarMovies.set([]);
    this._error.set(null);
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this._error.set(null);
  }
}
