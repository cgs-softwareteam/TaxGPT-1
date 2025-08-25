import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupSession, setupPassport, setupAuthRoutes } from "./auth";
import { initializeDatabase } from "./db";

const app = express();

// --- START: HTTPS REDIRECT MIDDLEWARE ---
if (process.env.NODE_ENV === 'production') {
  // Configure Express to trust the first proxy hop, which is standard for Replit.
  app.set('trust proxy', 1);
  
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Use Express's built-in `req.secure` property, which is now reliable
    // due to the 'trust proxy' setting.
    if (!req.secure) {
      // If the request is not secure, redirect to the HTTPS version of the same URL.
      const httpsUrl = `https://${req.get('host')}${req.originalUrl}`;
      return res.redirect(301, httpsUrl);
    }
    
    // If the request is already secure, proceed to the next middleware.
    next();
  });
}
// --- END: HTTPS REDIRECT MIDDLEWARE ---

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize database if enabled
  initializeDatabase();

  // Setup authentication
  setupSession(app);
  setupPassport();
  setupAuthRoutes(app);

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Global Error Handler caught:", err); // Log the error for debugging
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
