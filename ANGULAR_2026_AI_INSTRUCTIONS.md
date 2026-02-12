# ANGULAR_2026_AI_INSTRUCTIONS.md

## 0. MISSION STATEMENT
Build a scalable, high-performance Angular application using the 2026 "Professional Standard." This project strictly adheres to **Standalone-First** architecture, **Signal-driven** state management, and **Feature-Sliced** organization. No `NgModules` are permitted.

---

## 1. DIRECTORY STRUCTURE
The AI must organize the codebase into these specific bounded contexts:

```text
src/
├── app/
│   ├── core/               # Global Singletons: Guards, Functional Interceptors, Global Services
│   ├── shared/             # Reusable UI (Dumb Components), Pipes, Directives (UI Toolkit)
│   ├── layout/             # App Shell: Header, Footer, Sidebar, Layout Components
│   ├── features/           # Domain-Specific Logic
│   │   └── [feature-name]/
│   │       ├── components/ # Feature-specific Smart and Presentational components
│   │       ├── services/   # API logic / Data access for this feature
│   │       ├── store/      # State management (NgRx SignalStore)
│   │       ├── models/     # Types and Interfaces
│   │       └── [feature].routes.ts # Feature-specific routing
│   ├── app.config.ts       # Application providers (Router, HttpClient, etc.)
│   ├── app.routes.ts       # Root routing (Lazy loading features)
│   └── app.component.ts    # Main entry component
├── assets/                 # Static files
└── styles/                 # Global SCSS, design tokens, and theme configurations
```

---

## 2. COMPONENT ARCHITECTURE & CODING STANDARDS

### A. Component Metadata
- All components MUST be `standalone: true`.
- Default to `changeDetection: ChangeDetectionStrategy.OnPush`.
- Use `:host` for component-level styling to ensure encapsulation.

### B. Dependency Injection (DI)
- Use the `inject()` function exclusively. Avoid constructor injection.
```typescript
// ✅ YES
private readonly userService = inject(UserService);

// ❌ NO
constructor(private userService: UserService) {}
```

### C. Signal-Based Communication
- Use the modern Signal API for data flow:
  - `input<T>()` / `input.required<T>()` instead of `@Input()`.
  - `output()` instead of `@Output()`.
  - `model()` for two-way synchronization.
- Use `computed()` for derived state to ensure reactivity without side effects.
- Use `effect()` sparingly (only for logging, manual DOM manipulation, or syncing with external APIs).

---

## 3. TEMPLATE SYNTAX (Modern Control Flow)
Never use `*ngIf`, `*ngFor`, or `*ngSwitch`. Use the native `@` syntax:

```html
@if (user(); as u) {
  <p>Welcome, {{ u.name }}</p>
} @else {
  <app-login-prompt />
}

@for (item of items(); track item.id) {
  <app-list-item [data]="item" />
} @empty {
  <p>No items found.</p>
}
```

---

## 4. STATE MANAGEMENT
- **Local UI State:** Use `signal()`.
- **Global/Feature State:** Use `@ngrx/signals` (SignalStore).
  - Define state, signals, and methods within the feature's `store/` folder.
- **RxJS Integration:** - Use RxJS only for complex async streams (WebSockets, Debouncing, Polling).
  - Use `toSignal(observable$)` to consume data in templates.

---

## 5. DATA FETCHING & API
- **HttpClient:** Use functional interceptors.
- **Pattern:** Services should return `Observable<T>`. Components or Stores should convert these to Signals using `toSignal()` for template usage.
- **Example:**
```typescript
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();
  const authReq = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  return next(authReq);
};
```

---

## 6. ROUTING & PERFORMANCE
- **Lazy Loading:** All feature modules must be lazy-loaded in `app.routes.ts`.
- **Component Input Binding:** Enable `withComponentInputBinding()` in `provideRouter`.
- **Deferrable Views:** Use `@defer` for non-critical UI components to optimize initial bundle size.
```html
@defer (on viewport) {
  <app-heavy-chart />
} @placeholder {
  <div>Loading chart...</div>
}
```

---

## 7. AI AGENT OPERATIONAL CONSTRAINTS
1. **No NgModules:** If the agent suggests an `NgModule`, it is an error.
2. **Strict Typing:** All interfaces and signals must be strictly typed. Avoid `any`.
3. **File Naming:** Follow `[feature-name].[type].ts` (e.g., `user-list.component.ts`).
4. **Small Components:** Break components down if they exceed 200 lines of code.

**End of Instructions.**