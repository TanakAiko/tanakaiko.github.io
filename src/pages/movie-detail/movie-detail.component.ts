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
import { NotificationService } from '../../services/notification.service';
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
  private readonly notificationService = inject(NotificationService);
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

  // -------------------------------------------------------------------------
  // Rating & Watchlist
  // -------------------------------------------------------------------------
  
  /**
   * Submit or update movie rating
   */
  setRating(score: number): void {
    if (!this.authService.isLoggedIn()) {
      this.notificationService.error('Please login to rate movies');
      return;
    }
    this.currentRating.set(score);
  }

  /**
   * Submit comment along with rating
   */
  submitReview(): void {
    if (!this.authService.isLoggedIn()) {
      this.notificationService.error('Please login to review');
      return;
    }
  
    const tmdbId = this.tmdbIdParam();
    if (!tmdbId) return;

    // Must have a rating to leave a comment usually, or at least it updates the rating
    const score = this.currentRating() || this.userRating() || 0;
    
    if (score === 0) {
       this.notificationService.error('Please select a rating score first');
       return;
    }

    this.isSubmittingReview.set(true);

    this.ratingService.rateMovie(tmdbId, score, this.reviewComment()).subscribe({
      next: () => {
        // NotificationService is handled in RatingService, but we can add UI hints here if needed
        this.isSubmittingReview.set(false);
      },
      error: () => {
        this.isSubmittingReview.set(false);
      }
    });
  }

  /**
   * Toggle watchlist status
   */
  toggleWatchlist(): void {
    if (!this.authService.isLoggedIn()) {
      this.notificationService.error('Please login to manage watchlist');
      return;
    }

    const tmdbId = this.tmdbIdParam();
    if (!tmdbId) return;

    if (this.inWatchlist()) {
      this.watchlistService.removeFromWatchlist(tmdbId).subscribe({
        next: () => this.notificationService.success('Removed from watchlist'),
        error: () => this.notificationService.error('Failed to remove from watchlist')
      });
    } else {
      this.watchlistService.addToWatchlist(tmdbId).subscribe({
        next: () => this.notificationService.success('Added to watchlist'),
        error: () => this.notificationService.error('Failed to add to watchlist')
      });
    }
  }

  /**
   * Open recommendation modal
   */
  openRecommendationModal(): void {
    if (!this.authService.isLoggedIn()) {
      this.notificationService.error('Please login to recommend movies');
      return;
    }
    this.recommendationMessage.set('');
    this.selectedFriend.set(null);
    this.showRecommendModal.set(true);
  }

  /**
   * Close recommendation modal
   */
  closeRecommendModal(): void {
    this.showRecommendModal.set(false);
    this.selectedFriend.set(null);
    this.recommendationMessage.set('');
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
        this.notificationService.success(`Recommended to ${friend.displayName}`);
        this.isSubmittingRecommendation.set(false);
        this.closeRecommendModal();
      },
      error: () => {
        this.notificationService.error('Failed to send recommendation');
        this.isSubmittingRecommendation.set(false);
      }
    });
  }

  getCurrentUrl(): string {
    return window.location.href;
  }

  copyToClipboard(): void {
    navigator.clipboard.writeText(this.getCurrentUrl()).then(() => {
      this.notificationService.success('Link copied to clipboard');
    });
  }
}
