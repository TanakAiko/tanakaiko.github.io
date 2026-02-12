# Neo4flix Backend API Documentation

> **Version**: 1.0.0  
> **Last Updated**: February 2026  
> **Architecture**: Spring Boot 4.x Microservices with OAuth2/Keycloak  
> **Database**: Neo4j Graph Database

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Authentication & Security](#4-authentication--security)
5. [API Gateway](#5-api-gateway)
6. [User Service](#6-user-service)
7. [Movie Service](#7-movie-service)
8. [Rating Service](#8-rating-service)
9. [Recommendation Service](#9-recommendation-service)
10. [Neo4j Graph Schema](#10-neo4j-graph-schema)
11. [Environment Variables](#11-environment-variables)
12. [Running the Services](#12-running-the-services)

---

## 1. Overview

Neo4flix is a **graph-based movie recommendation platform** that leverages Neo4j's graph database capabilities to provide personalized movie recommendations through collaborative filtering and content-based algorithms.

### Key Features
- User registration and authentication via Keycloak
- Social features (follow/unfollow users)
- Movie catalog powered by TMDB API
- User ratings (1-5 stars)
- Personalized recommendations based on user behavior
- Watchlist management
- Social sharing of recommendations

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Angular Frontend                              │
│                        (Port: 4200)                                  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        API Gateway                                   │
│                        (Port: 8085)                                  │
│           Spring Cloud Gateway Server WebMVC                         │
│           JWT Validation at Gateway Level                            │
└─────────────────────────────────────────────────────────────────────┘
           │              │              │              │
           ▼              ▼              ▼              ▼
   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────────┐
   │   User    │  │   Movie   │  │  Rating   │  │  Recommendation   │
   │  Service  │  │  Service  │  │  Service  │  │      Service      │
   │  (8081)   │  │  (8082)   │  │  (8083)   │  │      (8084)       │
   └───────────┘  └───────────┘  └───────────┘  └───────────────────┘
           │              │              │              │
           └──────────────┴──────────────┴──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────┐
                    │           Neo4j                 │
                    │      (Bolt: 7687)               │
                    │      (Browser: 7474)            │
                    └─────────────────────────────────┘
                                   
                    ┌─────────────────────────────────┐
                    │          Keycloak               │
                    │        (Port: 8080)             │
                    │     Realm: neo4flix             │
                    └─────────────────────────────────┘
```

### Service Communication
- All services are **OAuth2 Resource Servers** that validate JWTs from Keycloak
- Services share the same Neo4j database instance
- The API Gateway is the single entry point for frontend requests
- Services use the Keycloak `sub` claim as the primary user identifier

---

## 3. Technology Stack

### Backend Framework
| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Spring Boot | 4.x |
| Language | Java | 21 |
| Build Tool | Maven | 3.x |

### Core Dependencies
| Dependency | Purpose |
|------------|---------|
| `spring-boot-starter-webmvc` | REST API development |
| `spring-boot-starter-data-neo4j` | Neo4j graph database integration (SDN 7+) |
| `spring-boot-starter-security-oauth2-resource-server` | JWT validation & OAuth2 |
| `spring-boot-starter-validation` | Request validation (Jakarta) |
| `spring-boot-starter-actuator` | Health checks & monitoring |
| `spring-cloud-starter-gateway-server-webmvc` | API Gateway (Gateway only) |
| `keycloak-admin-client` | Keycloak Admin API (User Service only) |
| `tmdb-java` | TMDB API integration (Movie Service only) |
| `lombok` | Boilerplate code reduction |

### External Services
| Service | Purpose |
|---------|---------|
| **Keycloak** | Identity & Access Management (OIDC) |
| **Neo4j** | Graph database for users, movies, and relationships |
| **TMDB API** | Movie metadata source |

---

## 4. Authentication & Security

### Overview
All services use **Spring Security OAuth2 Resource Server** to validate JWTs issued by Keycloak.

### Keycloak Configuration
- **Realm**: `neo4flix`
- **Client**: `neo4flix-user-service` (confidential)
- **Authentication Flow**: Password Grant (via User Service proxy)
- **Token Format**: JWT with RS256 signing

### JWT Claims Used
```json
{
  "sub": "user-keycloak-uuid",           // Primary user identifier
  "preferred_username": "john_doe",       // Display username
  "email": "john@example.com",
  "realm_access": {
    "roles": ["user", "admin"]            // Role-based access control
  }
}
```

### Role Mapping
Keycloak roles are automatically mapped to Spring Security authorities:
- `user` → `ROLE_USER`
- `admin` → `ROLE_ADMIN`

### SecurityConfig Pattern
Each service implements a `SecurityFilterChain` bean with:
```java
http
    .csrf(csrf -> csrf.disable())
    .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
    .authorizeHttpRequests(auth -> auth
        .requestMatchers("/actuator/health").permitAll()
        // ... endpoint-specific rules
    )
    .oauth2ResourceServer(oauth2 -> oauth2
        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
    );
```

---

## 5. API Gateway

### Base URL
```
http://localhost:8085
```

### Purpose
- Single entry point for all frontend requests
- JWT validation at the edge
- Request routing to downstream services
- CORS handling (when enabled)

### Route Configuration
| Route Pattern | Target Service |
|---------------|----------------|
| `/api/users/**` | User Service (8081) |
| `/api/movies/**` | Movie Service (8082) |
| `/api/ratings/**` | Rating Service (8083) |
| `/api/recommendations/**` | Recommendation Service (8084) |

### Public Endpoints (No JWT Required)
- `POST /api/users/register`
- `POST /api/users/login`
- `POST /api/users/refresh`
- `GET /api/users/search`
- `GET /api/users/{username}`
- `GET /api/users/{username}/followers`
- `GET /api/users/{username}/following`
- `GET /api/movies/**` (all read operations)

### Configuration
```properties
# application.properties
server.port=8085
spring.security.oauth2.resourceserver.jwt.issuer-uri=${KEYCLOAK_ISSUER_URI}
spring.security.oauth2.resourceserver.jwt.jwk-set-uri=${KEYCLOAK_JWK_SET_URI}

gateway.services.user-service=${USER_SERVICE_URL:http://localhost:8081}
gateway.services.movie-service=${MOVIE_SERVICE_URL:http://localhost:8082}
gateway.services.rating-service=${RATING_SERVICE_URL:http://localhost:8083}
gateway.services.recommendation-service=${RECOMMENDATION_SERVICE_URL:http://localhost:8084}
```

---

## 6. User Service

### Base Path
```
/api/users
```

### Port
```
8081
```

### Purpose
- User registration (creates user in both Keycloak and Neo4j)
- Authentication (proxies token requests to Keycloak)
- User profile management
- Social features (follow/unfollow)

---

### DTOs

#### RegistrationDTO (Request)
```java
public record RegistrationDTO(
    @NotBlank @Size(min = 3, max = 20)
    String username,
    
    @NotBlank @Email
    String email,
    
    @NotBlank
    String firstname,
    
    @NotBlank
    String lastname,
    
    @NotBlank @Size(min = 8)
    @Pattern(regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$")
    String password
)
```

**Password Requirements**:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character (`@$!%*?&`)

#### LoginDTO (Request)
```java
public record LoginDTO(
    @NotBlank String username,
    @NotBlank String password,
    String totp          // Optional: only required when user has 2FA enabled
)
```

#### RefreshTokenDTO (Request)
```java
public record RefreshTokenDTO(
    @NotBlank
    String refreshToken
)
```

#### TokenResponseDTO (Response)
```java
public record TokenResponseDTO(
    @JsonProperty("access_token")
    String accessToken,
    
    @JsonProperty("refresh_token")
    String refreshToken,
    
    @JsonProperty("expires_in")
    Integer expiresIn,
    
    @JsonProperty("refresh_expires_in")
    Integer refreshExpiresIn,
    
    @JsonProperty("token_type")
    String tokenType  // Always "Bearer"
)
```

#### UserProfileDTO (Response - Authenticated User)
```java
@Builder
public record UserProfileDTO(
    String username,
    String email,
    String firstname,
    String lastname,
    Long followersCount,
    Long followingCount
)
```

#### PublicProfileDTO (Response - Any User)
```java
public record PublicProfileDTO(
    String username,
    String firstname,
    String lastname,
    Long followersCount,
    Long followingCount
)
```

---

### Endpoints

#### Authentication Endpoints

| Method | Endpoint | Auth | Request Body | Response | Description |
|--------|----------|------|--------------|----------|-------------|
| `POST` | `/register` | ❌ | `RegistrationDTO` | `String` (success message) | Register new user |
| `POST` | `/login` | ❌ | `LoginDTO` | `TokenResponseDTO` | Login and get tokens |
| `POST` | `/refresh` | ❌ | `RefreshTokenDTO` | `TokenResponseDTO` | Refresh access token |
| `POST` | `/logout` | ✅ | `RefreshTokenDTO` | `void` | Invalidate session |

#### Profile Endpoints

| Method | Endpoint | Auth | Request Body | Response | Description |
|--------|----------|------|--------------|----------|-------------|
| `GET` | `/me` | ✅ | - | `UserProfileDTO` | Get authenticated user's profile |
| `GET` | `/{username}` | ❌ | - | `PublicProfileDTO` | Get any user's public profile |
| `GET` | `/search?q={query}` | ❌ | - | `List<PublicProfileDTO>` | Search users by username/name |

#### Social Endpoints

| Method | Endpoint | Auth | Request Body | Response | Description |
|--------|----------|------|--------------|----------|-------------|
| `POST` | `/follow/{username}` | ✅ | - | `void` | Follow a user |
| `DELETE` | `/unfollow/{username}` | ✅ | - | `void` | Unfollow a user |
| `GET` | `/{username}/followers` | ❌ | - | `List<PublicProfileDTO>` | Get user's followers |
| `GET` | `/{username}/following` | ❌ | - | `List<PublicProfileDTO>` | Get users being followed |

#### Admin Endpoints

| Method | Endpoint | Auth | Role | Response | Description |
|--------|----------|------|------|----------|-------------|
| `DELETE` | `/{username}` | ✅ | `ADMIN` | `void` | Delete a user |

#### Two-Factor Authentication Endpoints

All 2FA endpoints require authentication (valid JWT).

| Method | Endpoint | Auth | Request Body | Response | Description |
|--------|----------|------|--------------|----------|-------------|
| `GET` | `/2fa/status` | ✅ | - | `TwoFactorStatusDTO` | Check if 2FA is enabled |
| `POST` | `/2fa/enable` | ✅ | - | `TwoFactorSetupDTO` | Initiate 2FA setup (returns secret + QR URI) |
| `POST` | `/2fa/verify` | ✅ | `TwoFactorVerifyDTO` | `void` | Verify TOTP code to finalize 2FA activation |
| `POST` | `/2fa/disable` | ✅ | - | `void` | Disable 2FA and remove OTP credentials |

##### TwoFactorStatusDTO (Response)
```java
public record TwoFactorStatusDTO(boolean enabled)
```

##### TwoFactorSetupDTO (Response)
```java
public record TwoFactorSetupDTO(
    String secret,       // Base32-encoded TOTP secret
    String otpAuthUri    // otpauth:// URI for QR code generation
)
```

##### TwoFactorVerifyDTO (Request)
```java
public record TwoFactorVerifyDTO(
    @NotBlank @Size(min = 6, max = 6) String code  // 6-digit TOTP code
)
```

##### 2FA Flow
1. **Enable**: `POST /2fa/enable` → Returns `TwoFactorSetupDTO` with secret and QR URI
2. **Scan**: User scans QR code with authenticator app (Google Authenticator, Authy, etc.)
3. **Verify**: `POST /2fa/verify` with the 6-digit code → Activates 2FA
4. **Login with 2FA**: `POST /login` with `username`, `password`, and `totp` fields
5. **Disable**: `POST /2fa/disable` → Removes OTP credential from Keycloak

---

### Neo4j Entity

```java
@Node("User")
public class User {
    @Id
    private String keycloakId;  // Keycloak's 'sub' claim
    
    @Property("username")
    private String username;
    
    @Property("email")
    private String email;
    
    @Property("firstname")
    private String firstname;
    
    @Property("lastname")
    private String lastname;
}
```

---

## 7. Movie Service

### Base Path
```
/api/movies
```

### Port
```
8082
```

### Purpose
- Browse trending and popular movies
- Search movies by title
- Get movie details (lazy-loaded from TMDB)
- Manage user watchlists

---

### DTOs

#### MovieSummaryDTO (Response - List View)
```java
@Data @Builder
public class MovieSummaryDTO {
    private Integer tmdbId;
    private String title;
    private String overview;
    private String posterPath;      // TMDB image path (e.g., "/abc123.jpg")
    private String backdropPath;    // TMDB backdrop image path for background
    private Double voteAverage;
    private Integer releaseYear;
    private List<String> genres;    // ["Action", "Sci-Fi"]
}
```

#### MovieDetailsDTO (Response - Detail View)
```java
@Data @Builder
public class MovieDetailsDTO {
    private Integer tmdbId;
    private String title;
    private String overview;
    private LocalDate releaseDate;
    private String posterPath;
    private String backdropPath;    // TMDB backdrop image path for background
    private Double voteAverage;
    
    private List<String> genres;         // ["Action", "Sci-Fi"]
    private List<PersonDTO> directors;
    private List<PersonDTO> cast;        // Top actors
}
```

#### PersonDTO (Response - Cast/Crew)
```java
@Data @Builder
public class PersonDTO {
    private Integer tmdbId;
    private String name;
    private String profilePath;  // TMDB image path
}
```

---

### Endpoints

#### Discovery Endpoints (Public)

| Method | Endpoint | Auth | Response | Description |
|--------|----------|------|----------|-------------|
| `GET` | `/trending` | ❌ | `List<MovieSummaryDTO>` | Get trending movies today |
| `GET` | `/popular` | ❌ | `List<MovieSummaryDTO>` | Get all-time popular movies |
| `GET` | `/random?count={n}` | ❌ | `List<MovieSummaryDTO>` | Get random movies (default 10, max 20) |
| `GET` | `/search?title={query}` | ❌ | `List<MovieSummaryDTO>` | Search movies by title |
| `GET` | `/{tmdbId}` | ❌ | `MovieDetailsDTO` | Get full movie details |
| `GET` | `/{tmdbId}/similar` | ❌ | `List<MovieSummaryDTO>` | Get similar movies |

#### Watchlist Endpoints (Authenticated)

| Method | Endpoint | Auth | Response | Description |
|--------|----------|------|----------|-------------|
| `GET` | `/watchlist` | ✅ | `List<MovieSummaryDTO>` | Get user's watchlist |
| `POST` | `/{tmdbId}/watchlist` | ✅ | `void` | Add movie to watchlist |
| `DELETE` | `/{tmdbId}/watchlist` | ✅ | `void` | Remove from watchlist |

---

### Neo4j Entities

#### MovieEntity
```java
@Node("Movie")
public class MovieEntity {
    @Id @GeneratedValue
    private Long internalId;
    
    @Property("tmdbId")
    private Integer tmdbId;
    
    @Property("title")
    private String title;
    
    @Property("overview")
    private String overview;
    
    @Property("releaseDate")
    private LocalDate releaseDate;
    
    @Property("posterPath")
    private String posterPath;
    
    @Property("backdropPath")
    private String backdropPath;
    
    @Property("voteAverage")
    private Double voteAverage;
    
    @Relationship(type = "IN_GENRE", direction = OUTGOING)
    private Set<GenreEntity> genres;
    
    @Relationship(type = "DIRECTED", direction = INCOMING)
    private Set<PersonEntity> directors;
    
    @Relationship(type = "ACTED_IN", direction = INCOMING)
    private Set<PersonEntity> cast;
}
```

#### GenreEntity
```java
@Node("Genre")
public class GenreEntity {
    @Id @GeneratedValue
    private Long internalId;
    
    @Property("tmdbId")
    private Integer tmdbId;
    
    @Property("name")
    private String name;
}
```

#### PersonEntity
```java
@Node("Person")
public class PersonEntity {
    @Id @GeneratedValue
    private Long internalId;
    
    @Property("tmdbId")
    private Integer tmdbId;
    
    @Property("name")
    private String name;
    
    @Property("profilePath")
    private String profilePath;
}
```

---

### TMDB Integration

The Movie Service integrates with **The Movie Database (TMDB) API** for:
- Fetching trending/popular movies
- Searching by title
- Getting detailed movie information (cast, crew, genres)
- Getting similar movies

**Lazy Loading Strategy**: Movies are fetched from TMDB and persisted to Neo4j on first access. Subsequent requests retrieve from the local graph database.

---

## 8. Rating Service

### Base Path
```
/api/ratings
```

### Port
```
8083
```

### Purpose
- Submit/update movie ratings (1-5 stars)
- Delete ratings
- View user's rating history
- Get average rating for movies

---

### DTOs

#### RatingRequestDTO (Request)
```java
@Data @Builder
public class RatingRequestDTO {
    @NotNull
    private Integer tmdbId;
    
    @NotNull
    @Min(1) @Max(5)
    private Integer score;

    @Size(max = 500)
    private String comment;  // Optional review comment
}
```

#### UserRatingDTO (Response)
```java
@Data @Builder
public class UserRatingDTO {
    private Integer tmdbId;
    private String title;
    private String posterPath;
    private Integer score;
    private String comment;
    private LocalDateTime ratedDate;
}
```

---

### Endpoints

| Method | Endpoint | Auth | Request Body | Response | Description |
|--------|----------|------|--------------|----------|-------------|
| `POST` | `/` | ✅ | `RatingRequestDTO` | `void` | Create/update a rating |
| `DELETE` | `/{tmdbId}` | ✅ | - | `void` | Delete a rating |
| `GET` | `/` | ✅ | - | `List<UserRatingDTO>` | Get all user's ratings |
| `GET` | `/movie/{tmdbId}` | ✅ | - | `Integer` | Get user's rating for a movie |
| `GET` | `/movie/{tmdbId}/average` | ❌ | - | `Double` | Get average rating for a movie |

---

### Neo4j Storage

Ratings are stored as **RATED relationships** between User and Movie nodes:

```cypher
(:User)-[:RATED {score: 4, comment: "Great movie!", timestamp: datetime()}]->(:Movie)
```

The Rating Service uses `Neo4jClient` directly instead of a repository pattern because `RATED` is a relationship, not a node entity.

---

## 9. Recommendation Service

### Base Path
```
/api/recommendations
```

### Port
```
8084
```

### Purpose
- Generate personalized movie recommendations
- Share recommendations with other users
- View received/sent recommendation shares

---

### DTOs

#### RecommendationDTO (Response)
```java
@Data @Builder
public class RecommendationDTO {
    private Integer tmdbId;
    private String title;
    private String posterPath;
    private String overview;
    private Double voteAverage;
    private Integer releaseYear;
    private String reason;  // e.g., "Popular among users who liked Inception"
}
```

#### ShareRequestDTO (Request)
```java
@Data @Builder
public class ShareRequestDTO {
    @NotNull
    private Integer tmdbId;
    
    @NotNull
    private String recipientUsername;
    
    private String message;  // Optional personal message
}
```

#### SharedRecommendationDTO (Response)
```java
@Data @Builder
public class SharedRecommendationDTO {
    // Movie info
    private Integer tmdbId;
    private String title;
    private String posterPath;
    private String overview;
    private Double voteAverage;
    private Integer releaseYear;
    
    // Share info
    private String fromUsername;
    private String message;
    private LocalDateTime sharedAt;
}
```

---

### Endpoints

| Method | Endpoint | Auth | Request Body | Response | Description |
|--------|----------|------|--------------|----------|-------------|
| `GET` | `/` | ✅ | - | `List<RecommendationDTO>` | Get personalized recommendations |
| `POST` | `/share` | ✅ | `ShareRequestDTO` | `void` | Share a movie with another user |
| `GET` | `/shared/received` | ✅ | - | `List<SharedRecommendationDTO>` | Get recommendations received |
| `GET` | `/shared/sent` | ✅ | - | `List<SharedRecommendationDTO>` | Get recommendations sent |

---

### Recommendation Algorithm

#### Collaborative Filtering
```cypher
// Find movies rated highly by users who have similar taste
MATCH (u:User {keycloakId: $userId})-[r1:RATED]->(m:Movie)<-[r2:RATED]-(other:User)
WHERE other <> u AND r2.score >= 4
WITH u, other, count(m) AS sharedMovies
WHERE sharedMovies >= 1
MATCH (other)-[r3:RATED]->(rec:Movie)
WHERE r3.score >= 4 AND NOT EXISTS((u)-[:RATED]->(rec))
RETURN rec.tmdbId, rec.title, rec.posterPath, rec.overview, 
       rec.voteAverage, rec.releaseYear,
       avg(r3.score) AS score, count(DISTINCT other) AS recommenders
ORDER BY recommenders DESC, score DESC
LIMIT 10
```

#### Fallback Strategy
If the user has insufficient ratings for collaborative filtering, the service:
1. Finds the user's highest-rated movie
2. Fetches similar movies from TMDB
3. Returns those as recommendations

---

### Neo4j Storage

Shared recommendations are stored as relationships:

```cypher
(:User)-[:SHARED_RECOMMENDATION {
    toUserId: "recipient-keycloak-id",
    toUsername: "recipient_name",
    message: "You'll love this!",
    sharedAt: datetime()
}]->(:Movie)
```

---

## 10. Neo4j Graph Schema

### Node Labels

| Label | Description | Primary Key |
|-------|-------------|-------------|
| `User` | Platform users | `keycloakId` (String) |
| `Movie` | Movie catalog | `internalId` (Long) + `tmdbId` (Integer) |
| `Genre` | Movie genres | `internalId` (Long) + `tmdbId` (Integer) |
| `Person` | Actors/Directors | `internalId` (Long) + `tmdbId` (Integer) |

### Relationship Types

| Relationship | From | To | Properties |
|--------------|------|-----|------------|
| `FOLLOWS` | User | User | - |
| `RATED` | User | Movie | `score` (Int), `comment` (String), `timestamp` (DateTime) |
| `IN_WATCHLIST` | User | Movie | - |
| `IN_GENRE` | Movie | Genre | - |
| `DIRECTED` | Person | Movie | - |
| `ACTED_IN` | Person | Movie | - |
| `SHARED_RECOMMENDATION` | User | Movie | `toUserId`, `toUsername`, `message`, `sharedAt` |

### Visual Schema
```
                              ┌───────────┐
                              │   Genre   │
                              └───────────┘
                                    ▲
                                    │ IN_GENRE
                              ┌─────┴─────┐
                              │   Movie   │
                              └───────────┘
                                ▲   ▲   ▲
                 DIRECTED ──────┘   │   └────── ACTED_IN
                                    │
                              ┌─────┴─────┐
                              │  Person   │
                              └───────────┘

┌───────────┐  FOLLOWS   ┌───────────┐
│   User    │ ─────────▶ │   User    │
└───────────┘            └───────────┘
      │
      ├──── RATED ────────────▶ (Movie)
      │
      ├──── IN_WATCHLIST ─────▶ (Movie)
      │
      └──── SHARED_RECOMMENDATION ─▶ (Movie)
```

---

## 11. Environment Variables

### Required Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEO4J_URI` | Neo4j Bolt connection URI | `bolt://localhost:7687` |
| `NEO4J_USERNAME` | Neo4j username | `neo4j` |
| `NEO4J_PASSWORD` | Neo4j password | `password` |
| `KEYCLOAK_ISSUER_URI` | Keycloak realm issuer URL | `http://localhost:8080/realms/neo4flix` |
| `KEYCLOAK_JWK_SET_URI` | Keycloak JWKS URL | `http://localhost:8080/realms/neo4flix/protocol/openid-connect/certs` |

### User Service Specific

| Variable | Description | Default |
|----------|-------------|---------|
| `KEYCLOAK_ADMIN_USERNAME` | Keycloak admin username | `admin` |
| `KEYCLOAK_ADMIN_PASSWORD` | Keycloak admin password | `admin` |
| `KEYCLOAK_SERVER_URL` | Keycloak base URL | `http://localhost:8080` |
| `KEYCLOAK_CLIENT_SECRET` | Client secret for service account | (required) |

### Movie Service Specific

| Variable | Description | Default |
|----------|-------------|---------|
| `TMDB_API_KEY` | TMDB API key | (required) |
| `TMDB_READ_ACCESS_TOKEN` | TMDB Read Access Token | (required) |

### API Gateway Specific

| Variable | Description | Default |
|----------|-------------|---------|
| `USER_SERVICE_URL` | User service base URL | `http://localhost:8081` |
| `MOVIE_SERVICE_URL` | Movie service base URL | `http://localhost:8082` |
| `RATING_SERVICE_URL` | Rating service base URL | `http://localhost:8083` |
| `RECOMMENDATION_SERVICE_URL` | Recommendation service URL | `http://localhost:8084` |

---

## 12. Running the Services

### Prerequisites
1. **Docker** and **Docker Compose** installed
2. **Neo4j** running on the `user-service_default` network
3. **Keycloak** running with `neo4flix` realm configured
4. `.env` file with required secrets

### Quick Start

```bash
# Start all services
docker-compose up -d --build

# Check health
curl http://localhost:8085/actuator/health
```

### Service URLs (Docker)

| Service | Internal URL | External URL |
|---------|--------------|--------------|
| API Gateway | `http://neo4flix-api-gateway:8085` | `http://localhost:8085` |
| User Service | `http://neo4flix-user-service:8081` | (internal only) |
| Movie Service | `http://neo4flix-movie-service:8082` | (internal only) |
| Rating Service | `http://neo4flix-rating-service:8083` | (internal only) |
| Recommendation Service | `http://neo4flix-recommendation-service:8084` | (internal only) |

### Local Development URLs

| Service | URL |
|---------|-----|
| API Gateway | `http://localhost:8085` |
| User Service | `http://localhost:8081` |
| Movie Service | `http://localhost:8082` |
| Rating Service | `http://localhost:8083` |
| Recommendation Service | `http://localhost:8084` |
| Neo4j Browser | `http://localhost:7474` |
| Keycloak Admin | `http://localhost:8080` |

---

## Appendix A: Frontend Integration Guide

### Authentication Flow

1. **Login**:
   ```typescript
   POST /api/users/login
   Body: { username: "john", password: "Password123!" }
   Response: { access_token: "...", refresh_token: "...", expires_in: 300 }
   ```

2. **Store tokens** in `localStorage` or secure memory

3. **Include Bearer token** in all authenticated requests:
   ```typescript
   headers: {
     'Authorization': `Bearer ${accessToken}`
   }
   ```

4. **Refresh tokens** before expiry:
   ```typescript
   POST /api/users/refresh
   Body: { refreshToken: "..." }
   ```

### TMDB Image URLs

Poster and backdrop images returned by the API need the TMDB base URL:
```typescript
// Poster image (for cards, lists)
const posterUrl = `https://image.tmdb.org/t/p/w500${movie.posterPath}`;

// Backdrop image (for hero banners, detail page backgrounds)
const backdropUrl = `https://image.tmdb.org/t/p/original${movie.backdropPath}`;
```

### Error Handling

All endpoints return standard HTTP status codes:
- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Missing/invalid JWT
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource already exists
- `500 Internal Server Error` - Server error

---

## Appendix B: Keycloak Realm Setup

### Required Configuration

1. **Create Realm**: `neo4flix`
2. **Create Client**: `neo4flix-user-service`
   - Client Protocol: `openid-connect`
   - Access Type: `confidential`
   - Direct Access Grants: `enabled`
3. **Create Roles**: `user`, `admin`
4. **Default Role**: Assign `user` to new registrations

### Token Endpoint
```
POST http://localhost:8080/realms/neo4flix/protocol/openid-connect/token
```

---

*This documentation is auto-generated based on the Neo4flix codebase. For updates, please regenerate from source.*
