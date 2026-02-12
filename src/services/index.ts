// ============================================================================
// SERVICES BARREL FILE
// Central export point for all application services
// ============================================================================

// Authentication
export { AuthService } from './auth.service';
export type { 
  User, 
  UserProfile, 
  PublicProfile,
  LoginRequest, 
  RegistrationRequest, 
  TokenResponse,
  TwoFactorStatus,
  TwoFactorSetup
} from './auth.service';

// Movies
export { MovieService } from './movie.service';
export type { 
  MovieSummary, 
  MovieDetails, 
  MovieDisplay,
  Person,
  PersonDisplay
} from './movie.service';

// Ratings
export { RatingService } from './rating.service';
export type { 
  RatingRequest, 
  UserRating 
} from './rating.service';

// Recommendations
export { RecommendationService } from './recommendation.service';
export type { 
  Recommendation,
  RecommendationDisplay,
  ShareRequest, 
  SharedRecommendation 
} from './recommendation.service';

// Watchlist
export { WatchlistService } from './watchlist.service';

// User Service
export { UserService } from './user.service';
export type { UserDisplay } from './user.service';
// Note: PublicProfile is exported from auth.service

// Notifications
export { NotificationService } from './notification.service';
export type { Notification, NotificationType } from './notification.service';

// Interceptors
export { authInterceptor } from './auth.interceptor';
