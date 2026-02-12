import { Component, inject, computed, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RecommendationService, RecommendationDisplay, SharedRecommendation } from '../../services/recommendation.service';
import { MovieService } from '../../services/movie.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-recommendations',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './recommendations.component.html',
  styleUrl: './recommendations.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecommendationsComponent implements OnInit {
  // -------------------------------------------------------------------------
  // Dependency Injection (Angular 2026 Standard)
  // -------------------------------------------------------------------------
  private readonly recommendationService = inject(RecommendationService);
  private readonly movieService = inject(MovieService);
  readonly authService = inject(AuthService);
  
  // -------------------------------------------------------------------------
  // State Management with Signals
  // -------------------------------------------------------------------------
  readonly activeTab = signal<'personalized' | 'received'>('personalized');

  // -------------------------------------------------------------------------
  // Computed Properties
  // -------------------------------------------------------------------------
  readonly recommendations = this.recommendationService.recommendationsDisplay;
  readonly receivedShares = this.recommendationService.receivedShares;
  readonly isLoading = this.recommendationService.isLoading;

  // -------------------------------------------------------------------------
  // Lifecycle Hooks
  // -------------------------------------------------------------------------
  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      this.recommendationService.fetchRecommendations().subscribe();
      this.recommendationService.fetchReceivedShares().subscribe();
    }
  }

  // -------------------------------------------------------------------------
  // Public Methods
  // -------------------------------------------------------------------------
  setActiveTab(tab: 'personalized' | 'received'): void {
    this.activeTab.set(tab);
  }

  getPosterUrl(posterPath: string | null): string {
    return this.movieService.getPosterUrl(posterPath);
  }
}
