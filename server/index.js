import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import { getDb } from './db.js';
import { seedDatabase } from './seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for rate limiting behind reverse proxies/Vite
app.set('trust proxy', 1);

// Security & Middlewares
app.use(helmet({
  contentSecurityPolicy: false, // allow Vite development & scripts
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3001').split(','),
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Mount API routes
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

// Serve static frontend in production if built
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));

// Fallback to client SPA
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const indexFile = path.join(distDir, 'index.html');
  res.sendFile(indexFile, (err) => {
    if (err) {
      res.status(200).send('API Server Running. Frontend available on Vite port or after build.');
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Start server and initialize database
async function startServer() {
  try {
    console.log('Initializing database connection...');
    await getDb();
    await seedDatabase();

    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`Question Database Server listening on http://localhost:${PORT}`);
      console.log(`Default Admin Account: username="admin", password="admin123"`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
