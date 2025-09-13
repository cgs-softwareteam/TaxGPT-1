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

  const sessionSecret = process.env.SESSION_SECRET;

  if (!sessionSecret) {
    console.error("FATAL ERROR: SESSION_SECRET environment variable is not set.");
    process.exit(1);
  }
  
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
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
      sameSite: 'lax',
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
    // Use Render domain for production, fallback to Replit domain, then localhost
    const callbackURL = process.env.RENDER_EXTERNAL_URL
      ? `${process.env.RENDER_EXTERNAL_URL}/auth/google/callback`
      : process.env.REPLIT_DOMAINS 
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
    // Use Render domain for production, fallback to Replit domain, then localhost
    const callbackURL = process.env.RENDER_EXTERNAL_URL
      ? `${process.env.RENDER_EXTERNAL_URL}/auth/facebook/callback`
      : process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS}/auth/facebook/callback`
        : "http://localhost:5000/auth/facebook/callback";
    
    passport.use(new FacebookStrategy({
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: callbackURL,
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

    app.get('/auth/google/callback', (req, res, next) => {
      const baseUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS}`
        : `http://localhost:5000`;

      passport.authenticate('google', (err: any, user: any, info: any) => {
        // Case 1: A system error occurred (e.g., database failure).
        if (err) {
          console.error("Authentication system error:", err);
          return res.redirect(`${baseUrl}/?error=internal_failure`);
        }

        // Case 2: Authentication failed (e.g., user denied permission).
        if (!user) {
          return res.redirect(`${baseUrl}/?error=auth_failed`);
        }

        // Case 3: Success. Manually log the user in.
        req.logIn(user, (loginErr) => {
          if (loginErr) {
            console.error("Session login error:", loginErr);
            return res.redirect(`${baseUrl}/?error=session_failure`);
          }
          
          return res.redirect(baseUrl);
        });
      })(req, res, next);
    });
  }

  // Facebook OAuth routes
  if (process.env.FACEBOOK_APP_ID) {
    app.get('/auth/facebook',
      passport.authenticate('facebook', { scope: ['email'] })
    );

    app.get('/auth/facebook/callback', (req, res, next) => {
      // Use the same robust baseUrl calculation for consistency.
      const baseUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS}`
        : `http://localhost:5000`;

      passport.authenticate('facebook', (err: any, user: any, info: any) => {
        // Case 1: A system error occurred (e.g., database failure).
        if (err) {
          console.error("Facebook Authentication system error:", err);
          return res.redirect(`${baseUrl}/?error=internal_failure`);
        }

        // Case 2: Authentication failed (e.g., user denied permission).
        if (!user) {
          return res.redirect(`${baseUrl}/?error=auth_failed`);
        }

        // Case 3: Success. Manually log the user in.
        req.logIn(user, (loginErr) => {
          if (loginErr) {
            console.error("Facebook Session login error:", loginErr);
            return res.redirect(`${baseUrl}/?error=session_failure`);
          }
          
          // Redirect to the dynamic base URL, an improvement over the original hardcoded '/'.
          return res.redirect(baseUrl);
        });
      })(req, res, next);
    });
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
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  });
}