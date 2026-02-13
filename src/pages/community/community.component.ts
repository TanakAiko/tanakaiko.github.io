import { Component, inject, signal, computed, ChangeDetectionStrategy, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { UserService, UserDisplay } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-community',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './community.component.html',
  styleUrl: './community.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommunityComponent implements OnInit, OnDestroy {
  // -------------------------------------------------------------------------
  // Dependency Injection (Angular 2026 Standard)
  // -------------------------------------------------------------------------
  private readonly userService = inject(UserService);
  readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);

  // -------------------------------------------------------------------------
  // State Management with Signals
  // -------------------------------------------------------------------------

  /** Current search query */
  readonly searchQuery = signal('');

  /** Active tab */
  readonly activeTab = signal<'search' | 'followers' | 'following'>('search');

  /** Set of usernames the current user is following (for button state) */
  private readonly _followingSet = signal<Set<string>>(new Set());

  /** Loading state for follow/unfollow actions (keyed by username) */
  private readonly _followActionLoading = signal<Set<string>>(new Set());

  /** Whether we've loaded the following list at least once */
  private readonly _followingLoaded = signal(false);

  // Search debounce
  private readonly searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;

  // -------------------------------------------------------------------------
  // Public Readonly Signals
  // -------------------------------------------------------------------------
  readonly searchResults = this.userService.searchResults;
  readonly allUsers = this.userService.allUsers;
  readonly followers = this.userService.followers;
  readonly following = this.userService.following;
  readonly isLoading = this.userService.isLoading;

  /** Display list changes depending on the active tab */
  readonly displayedUsers = computed<UserDisplay[]>(() => {
    switch (this.activeTab()) {
      case 'followers': return this.followers();
      case 'following': return this.following();
      case 'search': 
        // If there's an active search query, show search results;
        // otherwise show all registered users
        return this.searchQuery() ? this.searchResults() : this.allUsers();
    }
  });

  readonly currentUsername = computed(() => this.authService.currentUser()?.username ?? '');

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  ngOnInit(): void {
    // Load all registered users for the community list
    this.userService.listAllUsers().subscribe();

    // Set up debounced search
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap(query => {
        if (!query.trim()) {
          // When search is cleared, refresh the all-users list
          this.userService.clearSearchResults();
          return this.userService.listAllUsers();
        }
        return this.userService.searchUsers(query);
      })
    ).subscribe();

    // Load the current user's following list to know follow states
    if (this.authService.isLoggedIn()) {
      const username = this.authService.currentUser()?.username;
      if (username) {
        this.userService.getFollowing(username).subscribe(following => {
          const set = new Set(following.map(u => u.username));
          this._followingSet.set(set);
          this._followingLoaded.set(true);
        });
      }
    }
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
    this.userService.clearSearchResults();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  onSearchInput(query: string): void {
    this.searchQuery.set(query);
    this.searchSubject.next(query);
  }

  switchTab(tab: 'search' | 'followers' | 'following'): void {
    this.activeTab.set(tab);
    const username = this.authService.currentUser()?.username;
    if (!username) return;

    if (tab === 'followers') {
      this.userService.getFollowers(username).subscribe();
    } else if (tab === 'following') {
      this.userService.getFollowing(username).subscribe(following => {
        const set = new Set(following.map(u => u.username));
        this._followingSet.set(set);
      });
    }
  }

  isFollowing(username: string): boolean {
    return this._followingSet().has(username);
  }

  isFollowLoading(username: string): boolean {
    return this._followActionLoading().has(username);
  }

  isSelf(username: string): boolean {
    return username === this.currentUsername();
  }

  toggleFollow(user: UserDisplay): void {
    if (!this.authService.isLoggedIn()) {
      this.notificationService.warning('Please sign in to follow users.');
      return;
    }

    // Mark loading
    this._followActionLoading.update(set => {
      const next = new Set(set);
      next.add(user.username);
      return next;
    });

    if (this.isFollowing(user.username)) {
      // Unfollow
      this.userService.unfollowUser(user.username).subscribe({
        next: () => {
          this._followingSet.update(set => {
            const next = new Set(set);
            next.delete(user.username);
            return next;
          });
          this.clearFollowLoading(user.username);
        },
        error: () => this.clearFollowLoading(user.username)
      });
    } else {
      // Follow
      this.userService.followUser(user.username).subscribe({
        next: () => {
          this._followingSet.update(set => {
            const next = new Set(set);
            next.add(user.username);
            return next;
          });
          this.clearFollowLoading(user.username);
        },
        error: () => this.clearFollowLoading(user.username)
      });
    }
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------
  private clearFollowLoading(username: string): void {
    this._followActionLoading.update(set => {
      const next = new Set(set);
      next.delete(username);
      return next;
    });
  }
}
