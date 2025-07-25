# replit.md

## Overview

TaxGPT is a conversational AI tax planning assistant built as a full-stack web application. The system provides users with personalized tax advice through a ChatGPT-like interface, collecting financial information through natural conversation and generating structured tax planning reports.

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
- **Development**: Hot reload with Vite integration in development mode

### Database Layer
- **ORM**: Drizzle ORM for type-safe database operations
- **Database**: PostgreSQL (configured for Neon Database)
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Session Storage**: PostgreSQL-backed sessions using connect-pg-simple

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

### Backend Components
1. **OpenAI Integration**: Direct integration with OpenAI GPT-4o model
   - Processes full conversation history for context retention
   - Uses sophisticated system prompt for two-phase interaction

2. **API Routes**: Single `/api/generate` endpoint for chat functionality
   - Accepts conversation arrays
   - Returns AI-generated responses
   - Handles error states gracefully

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