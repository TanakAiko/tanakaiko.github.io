// ============================================================================
// PRODUCTION ENVIRONMENT CONFIGURATION
// ============================================================================

export const environment = {
  production: true,
  
  // API Configuration - Production URL
  apiBaseUrl: 'https://elanor-nonprofessed-venus.ngrok-free.dev',
  
  // TMDB Image Configuration
  tmdbImageBaseUrl: 'https://image.tmdb.org/t/p',
  tmdbPosterSize: 'w500',
  tmdbBackdropSize: 'w1280',
  tmdbProfileSize: 'w185',
  
  // Feature Flags
  features: {
    enableMockData: false,
    enableDebugLogging: false,
  },
  
  // Authentication
  auth: {
    tokenRefreshBuffer: 30,
    storagePrefix: 'neo4flix_',
  }
} as const;

export type Environment = typeof environment;
