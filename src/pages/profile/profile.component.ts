import { Component, inject, computed, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { AuthService, TwoFactorSetup } from '../../services/auth.service';
import { RatingService, UserRating } from '../../services/rating.service';
import { RecommendationService, SharedRecommendation } from '../../services/recommendation.service';
import { MovieService } from '../../services/movie.service';
import { NotificationService } from '../../services/notification.service';
import * as QRCode from 'qrcode';

interface RatingDisplayItem {
  tmdbId: number;
  title: string;
  posterPath: string;
  poster: string;
  rating: number;
  comment: string;
  ratedDate: string;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfileComponent implements OnInit {
  // -------------------------------------------------------------------------
  // Dependency Injection (Angular 2026 Standard)
  // -------------------------------------------------------------------------
  readonly authService = inject(AuthService);
  private readonly ratingService = inject(RatingService);
  private readonly recommendationService = inject(RecommendationService);
  private readonly movieService = inject(MovieService);
  private readonly notificationService = inject(NotificationService);
  private readonly fb = inject(FormBuilder);
  
  // -------------------------------------------------------------------------
  // State Management with Signals
  // -------------------------------------------------------------------------
  readonly activeTab = signal<'reviews' | 'recommendations' | 'security'>('reviews');

  /** 2FA state signals */
  readonly twoFactorEnabled = signal<boolean>(false);
  readonly twoFactorSetup = signal<TwoFactorSetup | null>(null);
  readonly twoFactorQrCode = signal<string>('');
  readonly twoFactorLoading = signal<boolean>(false);
  readonly twoFactorStep = signal<'status' | 'setup' | 'verify'>('status');

  /** TOTP verification form */
  readonly totpVerifyForm: FormGroup = this.fb.group({
    code: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6), Validators.pattern(/^\d{6}$/)]]
  });

  // -------------------------------------------------------------------------
  // Computed Properties
  // -------------------------------------------------------------------------
  
  /** User's ratings converted to display format */
  readonly userReviews = computed<RatingDisplayItem[]>(() => {
    return this.ratingService.userRatings().map(rating => this.toDisplayItem(rating));
  });

  /** Received recommendations from friends */
  readonly userRecommendations = this.recommendationService.receivedShares;

  readonly isLoading = computed(() => 
    this.ratingService.isLoading() || this.recommendationService.isLoading()
  );

  // -------------------------------------------------------------------------
  // Lifecycle Hooks
  // -------------------------------------------------------------------------
  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      this.ratingService.fetchUserRatings().subscribe();
      this.recommendationService.fetchReceivedShares().subscribe();
      this.fetch2FAStatus();
    }
  }

  // -------------------------------------------------------------------------
  // 2FA Methods
  // -------------------------------------------------------------------------

  /**
   * Fetch the current 2FA status from the backend
   */
  fetch2FAStatus(): void {
    this.twoFactorLoading.set(true);
    this.authService.get2FAStatus().subscribe({
      next: (status) => {
        this.twoFactorEnabled.set(status.enabled);
        this.twoFactorLoading.set(false);
      },
      error: () => {
        this.twoFactorLoading.set(false);
      }
    });
  }

  /**
   * Start the 2FA enable flow — request setup data from backend
   */
  startEnable2FA(): void {
    this.twoFactorLoading.set(true);
    this.authService.enable2FA().subscribe({
      next: (setup) => {
        this.twoFactorSetup.set(setup);
        this.twoFactorStep.set('setup');
        this.twoFactorLoading.set(false);
        this.generateQrCode(setup.otpAuthUri);
      },
      error: () => {
        this.twoFactorLoading.set(false);
        this.notificationService.error('Failed to initiate 2FA setup. Please try again.');
      }
    });
  }

  /**
   * Proceed from QR code display to TOTP verification step
   */
  proceedToVerify(): void {
    this.twoFactorStep.set('verify');
    this.totpVerifyForm.reset();
  }

  /**
   * Verify the TOTP code to complete 2FA setup.
   * On success, auto-logout so the user must re-login with 2FA.
   */
  verify2FASetup(): void {
    if (this.totpVerifyForm.invalid) return;

    const { code } = this.totpVerifyForm.value;
    this.twoFactorLoading.set(true);

    this.authService.verify2FA(code).subscribe({
      next: () => {
        this.twoFactorEnabled.set(true);
        this.twoFactorStep.set('status');
        this.twoFactorSetup.set(null);
        this.twoFactorQrCode.set('');
        this.twoFactorLoading.set(false);
        this.notificationService.success(
          '2FA enabled! You will be logged out to verify your new setup.'
        );
        // Auto-logout after a short delay so the user can see the success message
        setTimeout(() => {
          this.authService.logout();
        }, 2000);
      },
      error: () => {
        this.twoFactorLoading.set(false);
        this.totpVerifyForm.reset();
        this.notificationService.error('Invalid verification code. Please try again.');
      }
    });
  }

  /**
   * Disable 2FA for the current user
   */
  disable2FA(): void {
    this.twoFactorLoading.set(true);
    this.authService.disable2FA().subscribe({
      next: () => {
        this.twoFactorEnabled.set(false);
        this.twoFactorStep.set('status');
        this.twoFactorLoading.set(false);
        this.notificationService.success('Two-factor authentication disabled.');
      },
      error: () => {
        this.twoFactorLoading.set(false);
        this.notificationService.error('Failed to disable 2FA. Please try again.');
      }
    });
  }

  /**
   * Cancel the 2FA setup flow and return to status view
   */
  cancel2FASetup(): void {
    this.twoFactorStep.set('status');
    this.twoFactorSetup.set(null);
    this.twoFactorQrCode.set('');
    this.totpVerifyForm.reset();
  }

  // -------------------------------------------------------------------------
  // Public Methods
  // -------------------------------------------------------------------------
  getPosterUrl(posterPath: string | null): string {
    return this.movieService.getPosterUrl(posterPath);
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------
  private toDisplayItem(rating: UserRating): RatingDisplayItem {
    return {
      tmdbId: rating.tmdbId,
      title: rating.title,
      posterPath: rating.posterPath,
      poster: this.movieService.getPosterUrl(rating.posterPath),
      rating: rating.score,
      comment: rating.comment || '',
      ratedDate: rating.ratedDate
    };
  }

  /**
   * Generate a QR code data URL from the otpAuthUri
   */
  private generateQrCode(otpAuthUri: string): void {
    QRCode.toDataURL(otpAuthUri, {
      width: 256,
      margin: 2,
      color: {
        dark: '#FFFFFF',
        light: '#1a1f26'
      }
    }).then((dataUrl: string) => {
      this.twoFactorQrCode.set(dataUrl);
    }).catch(() => {
      this.notificationService.error('Failed to generate QR code.');
    });
  }
}
