import { Component, inject, computed, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink, ParamMap } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MovieService, MovieSummary } from '../../services/movie.service';
import { WatchlistService } from '../../services/watchlist.service';
import { RatingService } from '../../services/rating.service';
import { RecommendationService } from '../../services/recommendation.service';
import { UserService, UserDisplay } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, switchMap, filter } from 'rxjs/operators';

@Component({
  selector: 'app-movie-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './movie-detail.component.html',
  styleUrl: './movie-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MovieDetailComponent implements OnInit {
  // -------------------------------------------------------------------------
  // Dependency Injection (Angular 2026 Standard)
  // -------------------------------------------------------------------------
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  readonly movieService = inject(MovieService);
  readonly authService = inject(AuthService);
  readonly watchlistService = inject(WatchlistService);
  private readonly ratingService = inject(RatingService);
  private readonly recommendationService = inject(RecommendationService);
  private readonly userService = inject(UserService);
  
  // -------------------------------------------------------------------------
  // Route Parameters
  // -------------------------------------------------------------------------
  private readonly tmdbIdParam = toSignal(
    this.route.paramMap.pipe(
      map((params: ParamMap) => {
        const id = params.get('tmdbId');
        return id ? parseInt(id, 10) : null;
      })
    )
  );

  // -------------------------------------------------------------------------
  // State Management with Signals
  // -------------------------------------------------------------------------
  readonly currentRating = signal(0);
  readonly reviewComment = signal('');
  readonly showRecommendModal = signal(false);
  readonly recommendationMessage = signal('');
  readonly selectedFriend = signal<UserDisplay | null>(null);
  readonly isSubmittingReview = signal(false);
  readonly isSubmittingRecommendation = signal(false);

  // -------------------------------------------------------------------------
  // Computed Properties
  // -------------------------------------------------------------------------
  readonly movie = this.movieService.selectedMovieDisplay;
  readonly similarMovies = computed(() => this.movieService.similarMovies());
  readonly isLoading = this.movieService.isLoading;
  readonly following = this.userService.following;

  // Get user's existing rating for this movie (from cache)
  readonly userRating = computed(() => {
    const tmdbId = this.tmdbIdParam();
    if (!tmdbId) return undefined;
    return this.ratingService.getCachedRating(tmdbId);
  });

  // Whether the current movie is in the user's watchlist (signal-based for OnPush)
  readonly inWatchlist = computed(() => {
    const tmdbId = this.tmdbIdParam();
    if (!tmdbId) return false;
    return this.watchlistService.watchlistIds().has(tmdbId);
  });

  // -------------------------------------------------------------------------
  // Lifecycle Hooks
  // -------------------------------------------------------------------------
  ngOnInit(): void {
    // Load movie when route param changes
    this.route.paramMap.pipe(
      map((params: ParamMap) => {
        const id = params.get('tmdbId');
        return id ? parseInt(id, 10) : null;
      }),
      filter((id): id is number => id !== null),
      switchMap(tmdbId => this.movieService.getMovieWithSimilar(tmdbId))
    ).subscribe();

    // Load following list for recommendations if logged in
    if (this.authService.isLoggedIn()) {
      const username = this.authService.currentUser()?.username;
      if (username) {
        this.userService.getFollowing(username).subscribe();
      }
      // Also load user's ratings and watchlist
      this.ratingService.fetchUserRatings().subscribe();
      this.watchlistService.fetchWatchlist().subscribe();
    }
  }

  // -------------------------------------------------------------------------
  // Public Methods
  // -------------------------------------------------------------------------

  /** Navigate back to the previous page */
  goBack(): void {
    this.location.back();
  }

  /** Navigate to browse page with search query */
  navigateToSearch(query: string): void {
    const trimmed = query.trim();
    if (trimmed) {
      this.router.navigate(['/browse'], { queryParams: { q: trimmed } });
    }
  }
  
  /** Get poster URL for similar movies */
  getSimilarPosterUrl(movie: MovieSummary): string {
    return this.movieService.getPosterUrl(movie.posterPath);
  }

  setRating(star: number): void {
    this.currentRating.set(star);
  }

  submitReview(): void {
    const tmdbId = this.tmdbIdParam();
    if (!tmdbId || this.currentRating() === 0) return;

    this.isSubmittingReview.set(true);
    
    this.ratingService.rateMovie(
      tmdbId, 
      this.currentRating(), 
      this.reviewComment() || undefined
    ).subscribe({
      next: () => {
        // Reset form
        this.currentRating.set(0);
        this.reviewComment.set('');
        this.isSubmittingReview.set(false);
      },
      error: () => {
        this.isSubmittingReview.set(false);
      }
    });
  }

  openRecommendModal(): void {
    this.recommendationMessage.set('');
    this.selectedFriend.set(null);
    this.showRecommendModal.set(true);
  }

  closeRecommendModal(): void {
    this.showRecommendModal.set(false);
  }

  sendRecommendationTo(friend: UserDisplay): void {
    const tmdbId = this.tmdbIdParam();
    if (!tmdbId) return;

    this.isSubmittingRecommendation.set(true);
    
    this.recommendationService.shareRecommendation(
      tmdbId,
      friend.username,
      this.recommendationMessage() || undefined
    ).subscribe({
      next: () => {
        this.isSubmittingRecommendation.set(false);
        this.closeRecommendModal();
      },
      error: () => {
        this.isSubmittingRecommendation.set(false);
      }
    });
  }

  getCurrentUrl(): string {
    return window.location.href;
  }

  copyToClipboard(): void {
    navigator.clipboard.writeText(this.getCurrentUrl()).then(() => {
      // Could add a toast notification here
    });
  }

  toggleWatchlist(): void {
    const tmdbId = this.tmdbIdParam();
    if (!tmdbId) return;
    this.watchlistService.toggleWatchlist(tmdbId).subscribe();
  }
}
