// Production Safety Guards for Render Deployment

export class ProductionSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionSafetyError';
  }
}

export function validateProductionEnvironment(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!isProduction) {
    return; // Skip validation in development
  }

  console.log('🔒 Running production safety validation...');

  // Critical environment variables for production
  const requiredVars = [
    'DATABASE_URL',
    'ENABLE_DATABASE_STORAGE',
    'OPENAI_API_KEY'
  ];

  const missing: string[] = [];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new ProductionSafetyError(
      `PRODUCTION FATAL: Missing required environment variables: ${missing.join(', ')}`
    );
  }

  // Validate database storage is enabled
  if (process.env.ENABLE_DATABASE_STORAGE !== 'true') {
    throw new ProductionSafetyError(
      'PRODUCTION FATAL: Database storage must be enabled in production'
    );
  }

  // Validate production database URL format
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && !dbUrl.includes('postgresql://') && !dbUrl.includes('postgres://')) {
    console.warn('⚠️ Database URL format may be incorrect for PostgreSQL');
  }

  console.log('✅ Production safety validation passed');
}

export function validateRenderCompatibility(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!isProduction) {
    return; // Skip validation in development
  }

  console.log('🚀 Validating Render deployment compatibility...');

  // Check for Render-specific environment variables
  const renderVars = [
    'RENDER_SERVICE_ID',
    'RENDER_SERVICE_NAME', 
    'RENDER_INSTANCE_ID'
  ] as const;

  const foundRenderVars = renderVars.filter(varName => process.env[varName]);
  
  if (foundRenderVars.length > 0) {
    console.log('✅ Render deployment environment detected');
    console.log(`Render service: ${process.env.RENDER_SERVICE_NAME || 'Unknown'}`);
  }

  // Validate port configuration for Render
  const port = process.env.PORT;
  if (!port) {
    console.warn('⚠️ PORT environment variable not set - using default 5000');
  } else {
    console.log(`✅ Port configured: ${port}`);
  }

  console.log('✅ Render compatibility validation passed');
}

export function logProductionStartup(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  
  console.log('='.repeat(60));
  console.log(`🏥 AITaxMD Server Starting - ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} Mode`);
  console.log('='.repeat(60));
  
  if (isProduction) {
    console.log('🔒 Production mode: Enhanced security and monitoring active');
    console.log('📊 Database: PostgreSQL (production-only)');
    console.log('🔄 Session store: PostgreSQL-backed');
    console.log('⚡ Connection pooling: Optimized for Render');
    console.log('🛡️ Graceful shutdown: SIGTERM/SIGINT handlers active');
  } else {
    console.log('🔧 Development mode: Hot reload and debugging active');
    console.log(`📊 Database: ${process.env.ENABLE_DATABASE_STORAGE === 'true' ? 'PostgreSQL' : 'Memory'}`);
  }
  
  console.log('='.repeat(60));
}