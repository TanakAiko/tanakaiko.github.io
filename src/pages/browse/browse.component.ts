import { Component, inject, signal, computed, ChangeDetectionStrategy, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MovieService, MovieSummary } from '../../services/movie.service';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { Subject, of, Subscription } from 'rxjs';

interface MovieDisplayItem {
  tmdbId: number;
  title: string;
  year: number;
  genre: string[];
  rating: number;
  description: string;
  poster: string;
}

@Component({
  selector: 'app-browse',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './browse.component.html',
  styleUrl: './browse.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BrowseComponent implements OnInit, OnDestroy {
  // -------------------------------------------------------------------------
  // Dependency Injection (Angular 2026 Standard)
  // -------------------------------------------------------------------------
  private readonly movieService = inject(MovieService);
  private readonly route = inject(ActivatedRoute);
  
  // -------------------------------------------------------------------------
  // State Management with Signals
  // -------------------------------------------------------------------------
  readonly decades = ['2020s', '2010s', '2000s', '1990s', 'Classic'];

  // Filters
  readonly searchQuery = signal('');
  readonly selectedGenres = signal<string[]>([]);
  readonly selectedDecade = signal<string>('');
  readonly minRating = signal(0);
  readonly maxRating = signal(5);

  // Search debounce
  private readonly searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;

  // Loading state
  readonly isLoading = this.movieService.isLoading;

  // -------------------------------------------------------------------------
  // Computed Properties
  // -------------------------------------------------------------------------

  // Dynamic genre list extracted from actual movie data
  readonly availableGenres = computed<string[]>(() => {
    const random = this.movieService.randomMovies();
    const popular = this.movieService.popularMovies();
    const searchResults = this.movieService.searchResults();
    const combined = [...random, ...popular, ...searchResults];
    const genreSet = new Set<string>();
    combined.forEach(m => (m.genres || []).forEach(g => genreSet.add(g)));
    return Array.from(genreSet).sort();
  });

  // Convert API movies to display format
  readonly movies = computed<MovieDisplayItem[]>(() => {
    const searchResults = this.movieService.searchResults();
    
    // Use search results if we have an active search
    if (this.searchQuery().trim()) {
      return searchResults.map(m => this.toDisplayItem(m));
    }

    // Combine random + popular and deduplicate
    const random = this.movieService.randomMovies();
    const popular = this.movieService.popularMovies();
    const seen = new Set<number>();
    const combined: MovieSummary[] = [];
    for (const m of [...random, ...popular]) {
      if (!seen.has(m.tmdbId)) {
        seen.add(m.tmdbId);
        combined.push(m);
      }
    }
    return combined.map(m => this.toDisplayItem(m));
  });

  readonly filteredMovies = computed<MovieDisplayItem[]>(() => {
    const movies = this.movies();
    const genres = this.selectedGenres();
    const decade = this.selectedDecade();
    const min = this.minRating();
    const max = this.maxRating();

    return movies.filter(movie => {
      // Rating Range Check (convert from 10-scale to 5-scale if needed)
      if (movie.rating < min || movie.rating > max) {
        return false;
      }

      // Genre (OR logic)
      if (genres.length > 0) {
        const hasGenre = movie.genre.some(g => genres.includes(g));
        if (!hasGenre) return false;
      }

      // Decade
      if (decade) {
          const year = movie.year;
          if (decade === '2020s' && (year < 2020 || year > 2029)) return false;
          if (decade === '2010s' && (year < 2010 || year > 2019)) return false;
          if (decade === '2000s' && (year < 2000 || year > 2009)) return false;
          if (decade === '1990s' && (year < 1990 || year > 1999)) return false;
          if (decade === 'Classic' && year >= 1990) return false;
      }

      return true;
    });
  });

  readonly hasActiveFilters = computed(() => {
    return this.searchQuery() !== '' || 
           this.selectedGenres().length > 0 || 
           this.selectedDecade() !== '' || 
           this.minRating() > 0 ||
           this.maxRating() < 5;
  });

  // -------------------------------------------------------------------------
  // Lifecycle Hooks
  // -------------------------------------------------------------------------
  ngOnInit(): void {
    // Fetch random and popular movies for the browse page
    this.movieService.fetchRandomMovies(20).subscribe();
    this.movieService.fetchPopularMovies().subscribe();

    // Set up search debounce
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => {
        if (query.trim()) {
          return this.movieService.searchMovies(query);
        }
        // Clear search results and return empty observable
        this.movieService.clearSearch();
        return of([]);
      })
    ).subscribe();

    // Check for search query param (from home/movie-detail search bars)
    const initialQuery = this.route.snapshot.queryParamMap.get('q');
    if (initialQuery?.trim()) {
      this.searchQuery.set(initialQuery.trim());
      this.searchSubject.next(initialQuery.trim());
    }
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
    this.searchSubject.complete();
  }

  // -------------------------------------------------------------------------
  // Public Methods
  // -------------------------------------------------------------------------

  onSearchChange(query: string): void {
    this.searchQuery.set(query);
    this.searchSubject.next(query);
  }

  updateMin(value: number): void {
    if (value > this.maxRating()) {
      this.minRating.set(this.maxRating());
    } else {
      this.minRating.set(value);
    }
  }

  updateMax(value: number): void {
    if (value < this.minRating()) {
      this.maxRating.set(this.minRating());
    } else {
      this.maxRating.set(value);
    }
  }

  toggleGenre(genre: string): void {
    this.selectedGenres.update(current => {
       if (current.includes(genre)) {
         return current.filter(g => g !== genre);
       } else {
         return [...current, genre];
       }
    });
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.movieService.clearSearch();
    this.selectedGenres.set([]);
    this.selectedDecade.set('');
    this.minRating.set(0);
    this.maxRating.set(5);
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------
  private toDisplayItem(movie: MovieSummary): MovieDisplayItem {
    return {
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.releaseYear,
      genre: movie.genres || [],
      rating: Math.round(movie.voteAverage * 10) / 10 / 2, // Convert 10-scale to 5-scale
      description: movie.overview,
      poster: this.movieService.getPosterUrl(movie.posterPath)
    };
  }
}
