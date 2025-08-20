import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { storage } from './storage';
import type { Express } from 'express';
import session from 'express-session';
import ConnectPgSimple from 'connect-pg-simple';
import { getDatabase } from './db';

// Feature flags
const ENABLE_AUTHENTICATION = process.env.ENABLE_AUTHENTICATION === 'true';
const ENABLE_DATABASE_STORAGE = process.env.ENABLE_DATABASE_STORAGE === 'true';

// Session configuration
export function setupSession(app: Express) {
  if (!ENABLE_AUTHENTICATION) {
    return;
  }

  const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-change-in-production';
  
  let sessionStore;
  if (ENABLE_DATABASE_STORAGE && process.env.DATABASE_URL) {
    // Use PostgreSQL session store when database is enabled
    const pgSession = ConnectPgSimple(session);
    sessionStore = new pgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      tableName: 'sessions',
    });
  }

  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: false, // Temporarily disable for debugging
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
      sameSite: 'lax', // Allow cross-site requests for OAuth
      // Remove domain restriction to fix session persistence
    },
  }));
}

// Passport configuration
export function setupPassport() {
  if (!ENABLE_AUTHENTICATION) {
    return;
  }

  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const callbackURL = process.env.REPLIT_DOMAINS 
      ? `https://${process.env.REPLIT_DOMAINS}/auth/google/callback`
      : "http://localhost:5000/auth/google/callback";
    
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: callbackURL
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user exists by Google ID
        let user = await storage.getUserByGoogleId(profile.id);
        
        if (!user) {
          // Check if user exists by email
          const email = profile.emails?.[0]?.value;
          if (email) {
            user = await storage.getUserByEmail(email);
          }
          
          if (user) {
            // Link Google account to existing user
            user = await storage.updateUser(user.id, { googleId: profile.id });
          } else {
            // Create new user
            user = await storage.createUser({
              googleId: profile.id,
              email: email || '',
              name: profile.displayName || '',
              profilePicture: profile.photos?.[0]?.value || null,
              role: 'user',
            });
          }
        } else {
          // Update last login time
          user = await storage.updateUser(user.id, { lastLoginAt: new Date() });
        }
        
        return done(null, user);
      } catch (error) {
        return done(error, undefined);
      }
    }));
  }

  // Facebook OAuth Strategy
  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    passport.use(new FacebookStrategy({
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: "/auth/facebook/callback",
      profileFields: ['id', 'displayName', 'photos', 'email']
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user exists by Facebook ID
        let user = await storage.getUserByFacebookId(profile.id);
        
        if (!user) {
          // Check if user exists by email
          const email = profile.emails?.[0]?.value;
          if (email) {
            user = await storage.getUserByEmail(email);
          }
          
          if (user) {
            // Link Facebook account to existing user
            user = await storage.updateUser(user.id, { facebookId: profile.id });
          } else {
            // Create new user
            user = await storage.createUser({
              facebookId: profile.id,
              email: email || '',
              name: profile.displayName || '',
              profilePicture: profile.photos?.[0]?.value || null,
              role: 'user',
            });
          }
        } else {
          // Update last login time
          user = await storage.updateUser(user.id, { lastLoginAt: new Date() });
        }
        
        return done(null, user);
      } catch (error) {
        return done(error, undefined);
      }
    }));
  }

  // Serialize/deserialize user for session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
}

// Authentication middleware
export function requireAuth(req: any, res: any, next: any) {
  if (!ENABLE_AUTHENTICATION) {
    return next();
  }

  if (req.isAuthenticated()) {
    return next();
  }
  
  res.status(401).json({ error: 'Authentication required' });
}

// Admin middleware
export function requireAdmin(req: any, res: any, next: any) {
  if (!ENABLE_AUTHENTICATION) {
    return next();
  }

  if (req.isAuthenticated() && req.user?.role === 'admin') {
    return next();
  }
  
  res.status(403).json({ error: 'Admin access required' });
}

// Setup authentication routes
export function setupAuthRoutes(app: Express) {
  if (!ENABLE_AUTHENTICATION) {
    return;
  }

  // Initialize passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Google OAuth routes
  if (process.env.GOOGLE_CLIENT_ID) {
    app.get('/auth/google',
      passport.authenticate('google', { scope: ['profile', 'email'] })
    );

    app.get('/auth/google/callback',
      passport.authenticate('google', { failureRedirect: '/?error=auth_failed' }),
      (req, res) => {
        console.log('OAuth callback successful, user authenticated:', req.user);
        console.log('OAuth callback - Session ID:', req.sessionID);
        console.log('OAuth callback - Session:', req.session);
        // Determine the correct base URL for redirect
        const baseUrl = process.env.REPLIT_DOMAINS 
          ? `https://${process.env.REPLIT_DOMAINS}`
          : `http://localhost:5000`;
        res.redirect(baseUrl);
      }
    );
  }

  // Facebook OAuth routes
  if (process.env.FACEBOOK_APP_ID) {
    app.get('/auth/facebook',
      passport.authenticate('facebook', { scope: ['email'] })
    );

    app.get('/auth/facebook/callback',
      passport.authenticate('facebook', { failureRedirect: '/?error=auth_failed' }),
      (req, res) => {
        res.redirect('/');
      }
    );
  }

  // Logout route
  app.post('/auth/logout', (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.json({ success: true });
    });
  });

  // Current user route
  app.get('/auth/user', (req, res) => {
    console.log('Auth check - Session ID:', req.sessionID);
    console.log('Auth check - Session:', req.session);
    console.log('Auth check - Is authenticated:', req.isAuthenticated());
    console.log('Auth check - User:', req.user);
    
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  });
}