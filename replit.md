# replit.md

## Overview

AITaxMD is a conversational AI tax planning assistant built as a full-stack web application. The system provides users with personalized tax advice through a ChatGPT-like interface, collecting financial information through natural conversation and generating structured tax planning reports.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application follows a modern full-stack architecture with clear separation between client and server concerns:

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent design
- **State Management**: React hooks for local state, TanStack Query for server state
- **Routing**: Wouter for lightweight client-side routing
- **UI Components**: Radix UI primitives wrapped with custom styling

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints with JSON communication
- **Authentication**: Passport.js with Google/Facebook OAuth 2.0 strategies
- **Session Management**: Express-session with PostgreSQL session store
- **Authorization**: Role-based access control (user/admin) with middleware protection
- **Development**: Hot reload with Vite integration in development mode

### Database Layer
- **ORM**: Drizzle ORM for type-safe database operations
- **Database**: PostgreSQL with comprehensive user and analytics schema
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Session Storage**: PostgreSQL-backed sessions using connect-pg-simple
- **Analytics**: Detailed usage tracking with token consumption, response times, and user behavior analytics
- **Feature Flags**: Database and authentication systems controlled by environment variables for safe deployment

## Key Components

### Frontend Components
1. **ChatInterface**: Renders conversation history with intelligent message formatting
   - Detects structured reports vs conversational messages
   - Renders markdown content for AI responses
   - Displays user messages in chat bubbles
   
2. **ChatInput**: Simple form with text input and send functionality
   - Handles form submission and loading states
   - Supports keyboard shortcuts (Enter to send)

3. **Home Page**: Main application container managing conversation state
   - Maintains conversation history array
   - Handles API communication with backend
   - Manages loading states
   - Includes navigation to demo page

4. **Demo Page**: Interactive showcase with simulated tax planning conversation
   - Pre-populated conversation showing complete tax consultation flow
   - Realistic structured tax report with financial calculations
   - Reset functionality to restore original demo conversation
   - Navigation back to main application

### Backend Components
1. **OpenAI Integration**: Direct integration with OpenAI GPT-4o model
   - Processes full conversation history for context retention
   - Uses sophisticated system prompt for two-phase interaction
   - Graceful error handling when API key not provided

2. **API Routes**: Single `/api/generate` endpoint for chat functionality
   - Accepts conversation arrays
   - Returns AI-generated responses
   - Handles error states gracefully
   - Provides helpful error messages for missing API configuration

3. **Storage Layer**: In-memory storage with interface for future database integration
   - User management capabilities
   - Extensible interface for CRUD operations

## Data Flow

1. **User Input**: User types message in ChatInput component
2. **State Update**: Message added to conversation array in Home component
3. **API Request**: Full conversation history sent to `/api/generate` endpoint
4. **OpenAI Processing**: Backend forwards conversation to OpenAI with system prompt
5. **Response Handling**: AI response processed and added to conversation
6. **UI Update**: ChatInterface re-renders with new message

The system maintains full conversational context by sending the entire message history with each request, enabling the AI to provide contextually relevant responses throughout the interaction.

## External Dependencies

### Core Dependencies
- **OpenAI API**: Primary AI service for generating responses
- **Neon Database**: PostgreSQL hosting service
- **React Ecosystem**: React, React DOM, React Query for frontend
- **UI Libraries**: Radix UI components, Lucide React icons
- **Utilities**: date-fns for date handling, react-markdown for content rendering

### Development Dependencies
- **Build Tools**: Vite, esbuild for production builds
- **TypeScript**: Full type safety across the stack
- **Tailwind CSS**: Utility-first styling with PostCSS

## Deployment Strategy

The application is configured for modern deployment practices:

### Build Process
1. **Frontend Build**: Vite compiles React application to static assets
2. **Backend Build**: esbuild bundles server code for Node.js production
3. **Output Structure**: Static files in `dist/public`, server bundle in `dist/`

### Environment Configuration
- **Development**: Uses tsx for hot-reload development server
- **Production**: Node.js execution of bundled server code
- **Database**: Requires `DATABASE_URL` environment variable
- **OpenAI**: Requires API key via environment variables

### Database Management
- **Schema**: Defined in shared TypeScript files
- **Migrations**: Managed through Drizzle Kit commands
- **Deployment**: `db:push` command for schema synchronization

The architecture supports easy scaling and maintenance while providing a smooth development experience with hot-reload capabilities and type safety throughout the stack.

## Recent Changes: Latest modifications with dates

### January 30, 2025
- **OAuth Authentication System**: Implemented complete Google/Facebook OAuth authentication using Passport.js with session management
- **Feature Flag Architecture**: Added ENABLE_AUTHENTICATION and ENABLE_DATABASE_STORAGE environment flags for safe deployment and gradual rollout
- **PostgreSQL Integration**: Created comprehensive database schema with users, usage tracking, and session storage using Drizzle ORM
- **Admin Dashboard**: Built full admin interface with usage statistics, user management, and analytics for system monitoring
- **User Management**: Added user menu, profile management, and personal usage history pages
- **Usage Tracking**: Implemented detailed conversation logging with token usage, response times, and analytics for both authenticated and anonymous users
- **Authentication Flow**: Created login prompt, user menu, and protected routes with role-based access control (admin vs user)
- **Branding Update**: Changed application name from "TaxGPT" to "AITaxMD" throughout all user-facing interfaces, including page titles, headers, welcome messages, API responses, and system prompts

### January 29, 2025
- **Enhanced Conversational Flow**: Fixed AI system prompt to automatically generate tax reports immediately after collecting all required information (income, state, age, tax paid) without asking for user confirmation
- **Expert Analysis Integration**: Moved "Get Expert Analysis" functionality from embedded display to main chat conversation flow for more natural user experience  
- **Professional Message Formatting**: Enhanced basic AI conversational replies with professional styling, ReactMarkdown components, and improved visual hierarchy
- **Clickable Strategy Cards**: Implemented expandable strategy cards with comprehensive implementation details, benefits, and considerations