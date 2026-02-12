import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgOptimizedImage, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  // -------------------------------------------------------------------------
  // Dependency Injection (Angular 2026 Standard)
  // -------------------------------------------------------------------------
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  readonly authService = inject(AuthService);

  // -------------------------------------------------------------------------
  // State Management with Signals
  // -------------------------------------------------------------------------
  readonly isLoginMode = signal(true);

  /** Whether the TOTP input step is shown (2FA required) */
  readonly requiresTotp = signal(false);

  /** Stored credentials while waiting for TOTP input */
  private pendingCredentials: { username: string; password: string } | null = null;

  // -------------------------------------------------------------------------
  // Form Groups
  // -------------------------------------------------------------------------
  
  /** Login Form */
  readonly loginForm: FormGroup = this.fb.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]]
  });

  /** TOTP verification form (shown after login when 2FA is enabled) */
  readonly totpForm: FormGroup = this.fb.group({
    totp: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6), Validators.pattern(/^\d{6}$/)]]
  });

  /** Registration Form based on Backend DTO */
  readonly registerForm: FormGroup = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(20)]],
    email: ['', [Validators.required, Validators.email]],
    firstname: ['', [Validators.required]],
    lastname: ['', [Validators.required]],
    password: ['', [
      Validators.required,
      Validators.minLength(8),
      Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    ]]
  });

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  toggleMode(): void {
    this.authService.clearError();
    this.isLoginMode.update(prev => !prev);
    this.requiresTotp.set(false);
    this.pendingCredentials = null;
  }

  onLogin(): void {
    if (this.loginForm.valid) {
      const { username, password } = this.loginForm.value;
      this.authService.login({ username, password }).subscribe({
        next: () => {
          this.router.navigate(['/home']);
        },
        error: (err) => {
          // Check if the backend indicates 2FA is required
          // The backend typically returns a 401/403 with a specific message
          // or a custom status indicating TOTP is needed
          const errorMsg = err?.message || err?.error || '';
          if (this.isTotpRequired(errorMsg)) {
            this.pendingCredentials = { username, password };
            this.requiresTotp.set(true);
            this.authService.clearError();
          }
          // Other errors are already displayed via authService.error() signal
        }
      });
    }
  }

  onSubmitTotp(): void {
    if (this.totpForm.valid && this.pendingCredentials) {
      const { username, password } = this.pendingCredentials;
      const { totp } = this.totpForm.value;
      this.authService.login({ username, password, totp }).subscribe({
        next: () => {
          this.pendingCredentials = null;
          this.requiresTotp.set(false);
          this.router.navigate(['/home']);
        },
        error: () => {
          // Invalid TOTP code — error displayed via authService.error() signal
          this.totpForm.reset();
        }
      });
    }
  }

  cancelTotp(): void {
    this.requiresTotp.set(false);
    this.pendingCredentials = null;
    this.totpForm.reset();
    this.authService.clearError();
  }

  onRegister(): void {
    if (this.registerForm.valid) {
      const { username, email, firstname, lastname, password } = this.registerForm.value;
      this.authService.register({ username, email, firstname, lastname, password }).pipe(
        // After successful registration, automatically log the user in
        switchMap(() => this.authService.login({ username, password }))
      ).subscribe({
        next: () => {
          this.router.navigate(['/home']);
        },
        error: () => {
          // If auto-login after register fails, switch to login mode
          // so user can log in manually. The error message is already
          // displayed via authService.error() signal.
          if (!this.isLoginMode()) {
            this.isLoginMode.set(true);
          }
        }
      });
    }
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Detect if the backend error indicates that a TOTP code is required.
   * Common patterns: "TOTP required", "2FA required", "totp_required",
   * or an HTTP 428 (Precondition Required) status.
   */
  private isTotpRequired(errorMsg: string): boolean {
    const lower = errorMsg.toLowerCase();
    return lower.includes('totp') || 
           lower.includes('2fa') || 
           lower.includes('two-factor') ||
           lower.includes('two factor') ||
           lower.includes('mfa');
  }
}
