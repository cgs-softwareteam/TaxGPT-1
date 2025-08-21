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
    console.log('⚠️  Authentication is DISABLED');
    return;
  }

  console.log('🔐 Initializing authentication system...');

  // Google OAuth Strategy with environment-based absolute callback URL
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const appDomain = process.env.APP_DOMAIN || 'http://localhost:5000';
    const callbackURL = `${appDomain}/auth/google/callback`;
    
    console.log(`🔧 Google OAuth Configuration:`);
    console.log(`   APP_DOMAIN: ${appDomain}`);
    console.log(`   Callback URL: ${callbackURL}`);
    
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: callbackURL
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('\n🔐 Google OAuth Strategy callback executing');
        console.log(`   Profile ID: ${profile.id}`);
        console.log(`   Profile Email: ${profile.emails?.[0]?.value}`);
        console.log(`   Profile Name: ${profile.displayName}`);
        console.log(`   Access Token: ${accessToken ? 'Present' : 'Missing'}`);
        
        // Check if user exists by Google ID
        console.log(`   Checking for existing user with Google ID: ${profile.id}`);
        let user = await storage.getUserByGoogleId(profile.id);
        
        if (!user) {
          console.log(`   ✗ No existing user found with Google ID`);
          // Check if user exists by email
          const email = profile.emails?.[0]?.value;
          if (email) {
            console.log(`   Checking for existing user with email: ${email}`);
            user = await storage.getUserByEmail(email);
          }
          
          if (user) {
            console.log(`   ✓ Found existing user by email, linking Google account`);
            // Link Google account to existing user
            user = await storage.updateUser(user.id, { googleId: profile.id });
            console.log(`   ✓ Google account linked to existing user: ${user.id}`);
          } else {
            console.log(`   Creating new user account`);
            // Create new user
            user = await storage.createUser({
              googleId: profile.id,
              email: email || '',
              name: profile.displayName || '',
              profilePicture: profile.photos?.[0]?.value || null,
              role: 'user',
            });
            console.log(`   ✓ New user created: ${user.id}`);
          }
        } else {
          console.log(`   ✓ Found existing user: ${user.id}`);
          // Update last login time
          user = await storage.updateUser(user.id, { lastLoginAt: new Date() });
          console.log(`   ✓ Updated last login time for user: ${user.id}`);
        }
        
        console.log(`   🎯 Authentication successful, returning user: ${user.id}`);
        return done(null, user);
      } catch (error) {
        console.error('\n❌ Error in Google OAuth Strategy:');
        console.error(`   Error: ${error}`);
        console.error(`   Stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
        return done(error, undefined);
      }
    }));
  }

  // Facebook OAuth Strategy
  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    const appDomain = process.env.APP_DOMAIN || 'http://localhost:5000';
    const facebookCallbackURL = `${appDomain}/auth/facebook/callback`;
    
    console.log(`🔧 Facebook OAuth Configuration:`);
    console.log(`   APP_DOMAIN: ${appDomain}`);
    console.log(`   Callback URL: ${facebookCallbackURL}`);
    
    passport.use(new FacebookStrategy({
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: facebookCallbackURL,
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
    console.log(`📦 Serializing user to session: ${user.id}`);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      console.log(`📦 Deserializing user from session: ${id}`);
      const user = await storage.getUser(id);
      if (user) {
        console.log(`✅ User found in database: ${user.name}`);
      } else {
        console.log(`❌ User not found in database for ID: ${id}`);
      }
      done(null, user);
    } catch (error) {
      console.error(`❌ Error deserializing user: ${error}`);
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
    console.log('⚠️  Authentication routes DISABLED');
    return;
  }

  console.log('🛣️  Setting up authentication routes...');

  // Initialize passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Google OAuth routes
  if (process.env.GOOGLE_CLIENT_ID) {
    app.get('/auth/google', (req, res, next) => {
      console.log('\n🚀 Starting Google OAuth login process');
      console.log(`   Request URL: ${req.protocol}://${req.get('host')}${req.originalUrl}`);
      console.log(`   User Agent: ${req.get('User-Agent')}`);
      console.log(`   Referer: ${req.get('Referer')}`);
      next();
    }, passport.authenticate('google', { scope: ['profile', 'email'] }));

    app.get('/auth/google/callback', (req, res, next) => {
      console.log('\n📥 Google OAuth callback received');
      console.log(`   Callback URL: ${req.protocol}://${req.get('host')}${req.originalUrl}`);
      console.log(`   Query params: ${JSON.stringify(req.query)}`);
      console.log(`   Session ID: ${req.sessionID}`);
      
      if (req.query.error) {
        console.log(`❌ OAuth Error: ${req.query.error}`);
        console.log(`   Error description: ${req.query.error_description}`);
      }
      next();
    }, passport.authenticate('google', { 
      failureRedirect: '/?error=auth_failed',
      failureFlash: false 
    }), (req, res) => {
      console.log('\n✅ OAuth callback successful!');
      console.log(`   User authenticated: ${JSON.stringify(req.user, null, 2)}`);
      console.log(`   Session authenticated: ${req.isAuthenticated()}`);
      
      // Dynamic redirect to the same domain user logged in from
      const protocol = req.secure ? 'https' : 'http';
      const host = req.get('host');
      const baseUrl = `${protocol}://${host}`;
      console.log(`   Redirecting to: ${baseUrl}`);
      
      res.redirect(baseUrl);
    });
  }

  // Facebook OAuth routes
  if (process.env.FACEBOOK_APP_ID) {
    app.get('/auth/facebook',
      passport.authenticate('facebook', { scope: ['email'] })
    );

    app.get('/auth/facebook/callback',
      passport.authenticate('facebook', { failureRedirect: '/?error=auth_failed' }),
      (req, res) => {
        console.log('Facebook OAuth callback successful, user authenticated:', req.user);
        // Dynamic redirect to the same domain user logged in from
        const protocol = req.secure ? 'https' : 'http';
        const host = req.get('host');
        const baseUrl = `${protocol}://${host}`;
        console.log(`Redirecting to: ${baseUrl}`);
        res.redirect(baseUrl);
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
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  });
}