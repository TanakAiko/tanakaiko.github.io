import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarComponent {
  // -------------------------------------------------------------------------
  // Dependency Injection (Angular 2026 Standard)
  // -------------------------------------------------------------------------
  private readonly authService = inject(AuthService);

  // -------------------------------------------------------------------------
  // Public State
  // -------------------------------------------------------------------------
  readonly isLoggedIn = this.authService.isLoggedIn;

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  logout(): void {
    this.authService.logout();
  }
}
