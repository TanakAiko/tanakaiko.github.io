// ============================================================================
// ENVIRONMENT CONFIGURATION - DEVELOPMENT
// Centralized configuration for API endpoints and feature flags
// ============================================================================

export const environment = {
  production: false,
  
  // API Configuration
  // In development, requests to /api are proxied to localhost:8085 via proxy.conf.json
  // This avoids CORS issues since requests go through the same origin
  apiBaseUrl: '',
  
  // TMDB Image Configuration
  tmdbImageBaseUrl: 'https://image.tmdb.org/t/p',
  tmdbPosterSize: 'w500',      // w92, w154, w185, w342, w500, w780, original
  tmdbBackdropSize: 'w1280',   // w300, w780, w1280, original
  tmdbProfileSize: 'w185',     // w45, w185, h632, original
  
  // Feature Flags
  features: {
    enableMockData: false, // Disable mock data - use real API
    enableDebugLogging: true,
  },
  
  // Authentication
  auth: {
    tokenRefreshBuffer: 30, // Seconds before expiry to refresh token
    storagePrefix: 'neo4flix_',
  }
} as const;

// Type for environment
export type Environment = typeof environment;
