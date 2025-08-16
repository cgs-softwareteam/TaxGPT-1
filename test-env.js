// Test environment variables
console.log("Environment variables check:");
console.log("ENABLE_AUTHENTICATION:", process.env.ENABLE_AUTHENTICATION);
console.log("ENABLE_DATABASE_STORAGE:", process.env.ENABLE_DATABASE_STORAGE);
console.log("DATABASE_URL present:", !!process.env.DATABASE_URL);
console.log("SESSION_SECRET present:", !!process.env.SESSION_SECRET);