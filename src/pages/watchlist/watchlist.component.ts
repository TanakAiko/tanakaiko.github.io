import { Component, inject, computed, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WatchlistService } from '../../services/watchlist.service';
import { MovieService, MovieSummary } from '../../services/movie.service';
import { AuthService } from '../../services/auth.service';

interface WatchlistDisplayItem {
  tmdbId: number;
  title: string;
  year: number;
  genre: string;
  poster: string;
}

@Component({
  selector: 'app-watchlist',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './watchlist.component.html',
  styleUrl: './watchlist.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WatchlistComponent implements OnInit {
  // -------------------------------------------------------------------------
  // Dependency Injection (Angular 2026 Standard)
  // -------------------------------------------------------------------------
  readonly watchlistService = inject(WatchlistService);
  private readonly movieService = inject(MovieService);
  readonly authService = inject(AuthService);

  // -------------------------------------------------------------------------
  // Computed Properties
  // -------------------------------------------------------------------------
  readonly watchlist = computed<WatchlistDisplayItem[]>(() => {
    return this.watchlistService.watchlistMovies().map(m => this.toDisplayItem(m));
  });

  readonly isLoading = this.watchlistService.isLoading;

  // -------------------------------------------------------------------------
  // Lifecycle Hooks
  // -------------------------------------------------------------------------
  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      this.watchlistService.fetchWatchlist().subscribe();
    }
  }

  // -------------------------------------------------------------------------
  // Public Methods
  // -------------------------------------------------------------------------
  removeFromWatchlist(tmdbId: number): void {
    this.watchlistService.removeFromWatchlist(tmdbId).subscribe();
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------
  private toDisplayItem(movie: MovieSummary): WatchlistDisplayItem {
    return {
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.releaseYear,
      genre: '', // Watchlist summary doesn't include genres
      poster: this.movieService.getPosterUrl(movie.posterPath)
    };
  }
}
