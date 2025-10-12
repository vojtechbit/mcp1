import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectToDatabase } from './config/database.js';
import authRoutes from './routes/authRoutes.js';
import apiRoutes from './routes/apiRoutes.js';
import oauthProxyRoutes from './routes/oauthProxyRoutes.js';
import privacyRoutes from './routes/privacyRoutes.js';
import debugRoutes from './routes/debugRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== MIDDLEWARE ====================

// Trust proxy (required for Render.com behind reverse proxy)
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: [
    'https://chat.openai.com',
    'https://chatgpt.com',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api', limiter);

// Request logging (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// ==================== ROUTES ====================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Gmail & Calendar OAuth Server',
    version: '1.0.0',
    description: 'OAuth proxy server for Custom GPT Actions',
    endpoints: {
      auth: '/auth/google',
      status: '/auth/status',
      api: '/api/*'
    },
    documentation: 'https://github.com/vojtechbit/mcp1'
  });
});

// OAuth Proxy routes (for ChatGPT Custom GPT)
app.use('/oauth', oauthProxyRoutes);

// Privacy Policy (required for public GPT)
app.use('/', privacyRoutes);

// Auth routes (legacy/direct access)
app.use('/auth', authRoutes);

// API routes (protected)
app.use('/api', apiRoutes);

// Debug routes (protected)
app.use('/api/debug', debugRoutes);

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// ==================== DATABASE & SERVER STARTUP ====================

async function startServer() {
  try {
    // Connect to MongoDB
    console.log('🔄 Connecting to MongoDB...');
    await connectToDatabase();
    console.log('✅ MongoDB connected successfully');

    // Start Express server
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(60));
      console.log('🚀 SERVER STARTED SUCCESSFULLY');
      console.log('='.repeat(60));
      console.log(`📍 Port: ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 Local: http://localhost:${PORT}`);
      console.log(`💚 Health: http://localhost:${PORT}/health`);
      console.log(`🔐 OAuth: http://localhost:${PORT}/auth/google`);
      console.log('='.repeat(60));
      console.log('📧 Gmail API: Ready');
      console.log('📅 Calendar API: Ready');
      console.log('🛡️  Security: Enabled');
      console.log('⚡ Rate limiting: Active');
      console.log('='.repeat(60) + '\n');
    });

  } catch (error) {
    console.error('❌ Failed to start server');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT signal received: closing HTTP server');
  process.exit(0);
});

// Start the server
startServer();
