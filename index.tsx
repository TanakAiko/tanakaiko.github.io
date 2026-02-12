import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation, withComponentInputBinding, Routes } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AppComponent } from './src/app.component';
import { LoginComponent } from './src/pages/login/login.component';
import { HomeComponent } from './src/pages/home/home.component';
import { BrowseComponent } from './src/pages/browse/browse.component';
import { MovieDetailComponent } from './src/pages/movie-detail/movie-detail.component';
import { RecommendationsComponent } from './src/pages/recommendations/recommendations.component';
import { WatchlistComponent } from './src/pages/watchlist/watchlist.component';
import { ProfileComponent } from './src/pages/profile/profile.component';
import { CommunityComponent } from './src/pages/community/community.component';
import { authInterceptor } from './src/services/auth.interceptor';

const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'auth', component: LoginComponent },
  { path: 'login', redirectTo: 'auth', pathMatch: 'full' }, // Legacy redirect
  { path: 'home', component: HomeComponent },
  { path: 'browse', component: BrowseComponent },
  { path: 'movie/:tmdbId', component: MovieDetailComponent },
  { path: 'recommendations', component: RecommendationsComponent },
  { path: 'watchlist', component: WatchlistComponent },
  { path: 'profile', component: ProfileComponent },
  { path: 'community', component: CommunityComponent },
];

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withHashLocation(), withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
}).catch(err => console.error(err));

// AI Studio always uses an `index.tsx` file for all project types.