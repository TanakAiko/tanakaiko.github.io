# Cinestream Movie Explorer

A modern Angular application for exploring movies, powered by Neo4j graph data. This is the frontend client for the Neo4flix platform.

## Features

- **Movie Discovery**: Browse popular, top-rated, and trending movies.
- **Personalized Recommendations**: Get movie suggestions based on your viewing habits.
- **Social Graph**: Follow other users and see their reviews and ratings.
- **Watchlist Management**: Specialized lists for movies you want to see.
- **User Profiles**: Customized profiles with viewing history and stats.

## Tech Stack

- **Framework**: Angular 21
- **Architecture**: Standalone Components, Signal-based State, Feature-Sliced Design
- **Styling**: Tailwind CSS
- **Build**: Vite

## Getting Started

### Prerequisites

- Node.js (Latest LTS recommended)
- [Neo4flix Backend](BACKEND_API_DOCUMENTATION.md) running on `localhost:8085`

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```
   The application will run at `http://localhost:4200`.

### Configuration

The frontend connects to the backend via a proxy configuration defined in `proxy.conf.json`.
By default, it forwards `/api` requests to `http://localhost:8085`.

## Documentation

- [Backend API Documentation](BACKEND_API_DOCUMENTATION.md) describes the services this frontend consumes.
- [Angular Architecture](ANGULAR_2026_AI_INSTRUCTIONS.md) outlines the coding standards and architectural principles used in this project.
