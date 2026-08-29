# Overview

Endlessalbum is a Russian couples' memory-sharing application built with React/Vite frontend and Express.js backend. The app allows couples to create shared accounts where they can store, view, and interact with memories (photos, videos, text, quotes) together. The system includes real-time chat with ephemeral messaging, interactive games, counters/timers, and a comprehensive role-based permission system designed specifically for two-person relationships.

The application emphasizes a minimalist, glass-morphism design aesthetic with light/dark theme support and focuses on creating an intimate digital space for couples to document their relationship journey.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as build tool
- **Styling**: Tailwind CSS with custom glass-morphism effects and shadcn/ui component library
- **State Management**: TanStack Query for server state, React hooks for local state
- **Routing**: Wouter for client-side routing with protected routes
- **UI Components**: Radix UI primitives with custom styling for accessibility
- **File Structure**: Organized into pages, components, hooks, and lib directories with clear separation of concerns

## Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Authentication**: Passport.js with local strategy using scrypt for password hashing
- **Session Management**: Express sessions — in-memory store in dev/test, PostgreSQL-backed (connect-pg-simple) in production
- **Real-time Features**: WebSocket implementation for live chat and notifications
- **API Design**: RESTful API with consistent error handling and authentication middleware

## Data Storage Solutions
- **Primary Database**: PostgreSQL hosted on Neon Database with connection pooling
- **ORM**: Drizzle with TypeScript schema definitions for type safety
- **File Storage**: Local uploads to `public/uploads/*` by default; optional Google Cloud Storage integration (GCS) for media uploads
- **Session Storage**: In-memory session store in dev/test; PostgreSQL-backed sessions (connect-pg-simple) in production
- **Schema Design**: Couples-centric data model with users, memories, comments, messages, games, and counters tables

## Authentication & Authorization
- **Registration Flow**: First user becomes main admin, can generate invite codes for partner
- **Role System**: Three-tier permission system (main_admin, co_admin, guest) with granular controls
- **Session Security**: HTTP-only sessions with CSRF protection and secure cookie settings
- **Invite System**: Unique invite codes for joining couples with automatic role assignment
- **Access Control**: Memory-level visibility settings and guest permission management

# External Dependencies

## Core Infrastructure
- **Database**: Neon Database (PostgreSQL) for primary data storage
- **File Storage**: Optional Google Cloud Storage for media uploads; default is local `public/uploads/*`
- **WebSocket**: Native WebSocket implementation for real-time chat features

## Development & Build Tools
- **Package Manager**: npm with lock file for dependency consistency
- **Build System**: Vite with TypeScript compilation and hot module replacement
- **UI Library**: shadcn/ui component system with Radix UI primitives
- **Styling**: Tailwind CSS with PostCSS for design system implementation
- **File Upload**: Uppy.js integration for drag-and-drop file uploads with cloud storage

## Third-Party Services
- **Font Loading**: Self-hosted Pitagon Sans Mono (woff2) for typography, selectable weights: Thin, ExtraLight, Light (default), Regular, Medium, SemiBold, Bold, ExtraBold
- **Image Processing**: Browser-native APIs for thumbnail generation and media handling
- **Email Services**: Configured for password recovery and account verification (implementation pending)
- **Analytics**: Replit development tools integration for debugging and monitoring

## Key Libraries
- **Query Management**: TanStack React Query for server state synchronization
- **Form Handling**: React Hook Form with Zod validation schemas
- **Date Handling**: Browser-native Date APIs with locale-specific formatting
- **Animation**: CSS transitions with Tailwind classes for smooth UI interactions
- **Icons**: Lucide React for consistent iconography throughout the application

# Recent Changes

## September 18, 2025 - Code Quality Polish & Finalization
- **Complete WebSocket Message Typing**: Created comprehensive discriminated union types for all game messages (PartnerQuizMessage, RolePlayingMessage, TruthOrDareMessage, TwentyQuestionsMessage) with BaseGameMessage interface
- **Removed All `any` Types**: Replaced all `handleGameMessage(data: any)` with strict types across all game components for better type safety and runtime error prevention
- **Fixed Type Conflicts**: Corrected category fields, score structures, and answer/guess field inconsistencies to ensure seamless type compatibility
- **Accessibility Compliance**: Added DialogDescription components to all modal dialogs with sr-only content to eliminate accessibility warnings while preserving visual design
- **Production Readiness**: Confirmed application stability with proper API responses, WebSocket connections, zero LSP errors, and architect-validated code quality

## Previous Quality Improvements
- Conducted comprehensive code quality review and fixed all TypeScript LSP errors across the entire codebase
- Improved type safety by replacing `any` types with proper TypeScript interfaces throughout server routes and client components
- Fixed boolean default value bugs using nullish coalescing (`?? true`) to preserve explicit false values
- Enhanced WebSocket connection handling and origin validation for better reliability in production environments
- Added comprehensive type definitions including Express.User interface, PartnerInfo, PartnerResponse, and CoupleSettings schemas