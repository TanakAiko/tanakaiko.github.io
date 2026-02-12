import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MovieService, MovieSummary } from '../../services/movie.service';
import { AuthService } from '../../services/auth.service';
import { WatchlistService } from '../../services/watchlist.service';

/**
 * Display model for movies in the home page
 */
interface MovieDisplayItem {
  tmdbId: number;
  title: string;
  year: number;
  rating: number;
  description: string;
  genres: string[];
  poster: string;
  backdrop: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements OnInit, OnDestroy {
  // -------------------------------------------------------------------------
  // Dependency Injection (Angular 2026 Standard)
  // -------------------------------------------------------------------------
  readonly movieService = inject(MovieService);
  readonly authService = inject(AuthService);
  readonly watchlistService = inject(WatchlistService);
  private readonly router = inject(Router);
  
  // -------------------------------------------------------------------------
  // State Management with Signals
  // -------------------------------------------------------------------------
  
  /** Currently displayed hero movie */
  readonly heroMovie = signal<MovieDisplayItem | null>(null);

  /** Index of the current hero movie in trending list */
  private heroIndex = 0;

  /** Interval ID for auto-rotation */
  private heroIntervalId: ReturnType<typeof setInterval> | null = null;

  /** Whether auto-rotation is paused (e.g. on hover) */
  private heroPaused = false;
  
  /** Loading state */
  readonly isLoading = this.movieService.isLoading;

  // -------------------------------------------------------------------------
  // Computed Properties
  // -------------------------------------------------------------------------
  
  /** Trending movies converted to display format */
  readonly trendingMovies = computed(() => 
    this.movieService.trendingMovies().map(m => this.toDisplayItem(m))
  );
  
  /** Popular movies converted to display format */
  readonly popularMovies = computed(() => 
    this.movieService.popularMovies().map(m => this.toDisplayItem(m))
  );
  
  /** Top rated movies (sorted by rating) */
  readonly topRatedMovies = computed(() => {
    const all = [...this.movieService.trendingMovies(), ...this.movieService.popularMovies()];
    // Deduplicate
    const unique = all.filter((movie, index, self) => 
      index === self.findIndex(m => m.tmdbId === movie.tmdbId)
    );
    // Sort by vote average and take top 10
    return unique
      .sort((a, b) => b.voteAverage - a.voteAverage)
      .slice(0, 10)
      .map(m => this.toDisplayItem(m));
  });

  /** Random movies for the Discover section */
  readonly randomMovies = computed(() =>
    this.movieService.randomMovies().map(m => this.toDisplayItem(m))
  );

  // -------------------------------------------------------------------------
  // Lifecycle Hooks
  // -------------------------------------------------------------------------
  ngOnInit(): void {
    // Fetch movies from API
    this.movieService.fetchAllMovies().subscribe({
      next: ([trending]) => {
        // Set hero movie to first trending movie
        if (trending.length > 0) {
          this.heroMovie.set(this.toDisplayItem(trending[0]));
          this.heroIndex = 0;
          this.startHeroRotation();
        }
      }
    });

    // Fetch random movies for Discover section
    this.movieService.fetchRandomMovies(20).subscribe();
    
    // Fetch watchlist if user is logged in
    if (this.authService.isLoggedIn()) {
      this.watchlistService.fetchWatchlist().subscribe();
    }
  }

  ngOnDestroy(): void {
    this.stopHeroRotation();
  }

  // -------------------------------------------------------------------------
  // Public Methods
  // -------------------------------------------------------------------------

  /** Navigate to browse page with search query */
  navigateToSearch(query: string): void {
    const trimmed = query.trim();
    if (trimmed) {
      this.router.navigate(['/browse'], { queryParams: { q: trimmed } });
    }
  }

  /** Fetch a new set of random movies */
  refreshRandomMovies(): void {
    this.movieService.fetchRandomMovies(20).subscribe();
  }
  
  /** Update Hero section on hover and pause auto-rotation */
  setHeroMovie(movie: MovieDisplayItem): void {
    this.heroMovie.set(movie);
    this.heroPaused = true;

    // Find the index of the hovered movie in trending so rotation continues from there
    const trending = this.trendingMovies();
    const idx = trending.findIndex(m => m.tmdbId === movie.tmdbId);
    if (idx !== -1) {
      this.heroIndex = idx;
    }
  }

  /** Resume auto-rotation when mouse leaves a movie card */
  resumeHeroRotation(): void {
    this.heroPaused = false;
  }

  /** Toggle watchlist for a movie */
  toggleWatchlist(movie: MovieDisplayItem): void {
    this.watchlistService.toggleWatchlist(movie.tmdbId).subscribe();
  }

  /** Check if movie is in watchlist (reads signal for OnPush reactivity) */
  isInWatchlist(tmdbId: number): boolean {
    return this.watchlistService.watchlistIds().has(tmdbId);
  }

  scrollLeft(element: HTMLElement): void {
    element.scrollBy({ left: -300, behavior: 'smooth' });
  }

  scrollRight(element: HTMLElement): void {
    element.scrollBy({ left: 300, behavior: 'smooth' });
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------
  
  /** Start auto-rotating hero movie every 5 seconds */
  private startHeroRotation(): void {
    this.stopHeroRotation();
    this.heroIntervalId = setInterval(() => {
      if (this.heroPaused) return;

      const trending = this.trendingMovies();
      if (trending.length === 0) return;

      this.heroIndex = (this.heroIndex + 1) % trending.length;
      this.heroMovie.set(trending[this.heroIndex]);
    }, 5000);
  }

  /** Stop the hero rotation interval */
  private stopHeroRotation(): void {
    if (this.heroIntervalId !== null) {
      clearInterval(this.heroIntervalId);
      this.heroIntervalId = null;
    }
  }

  /** Convert MovieSummary to display format */
  private toDisplayItem(movie: MovieSummary): MovieDisplayItem {
    return {
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.releaseYear,
      rating: Math.round(movie.voteAverage * 10) / 10 / 2, // Convert 10-scale to 5-scale
      description: movie.overview,
      genres: movie.genres || [],
      poster: this.movieService.getPosterUrl(movie.posterPath),
      backdrop: this.movieService.getBackdropUrl(movie.backdropPath),
    };
  }
}
