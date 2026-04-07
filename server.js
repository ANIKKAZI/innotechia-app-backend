'use strict';

require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const mongoose  = require('mongoose');

const Business  = require('./models/Business');
const Category  = require('./models/Category');
const Service   = require('./models/Service');
const Inquiry   = require('./models/Inquiry');

const MONGO_URI = process.env.MONGO_URI;
const PORT      = parseInt(process.env.PORT || '3000', 10);
// Allow Angular dev server (4200) and any production origin to call this API
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:4200').split(',');

const app = express();

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (e.g. curl, mobile apps) & listed origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
}));

app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ── Businesses ────────────────────────────────────────────────────────────────

/**
 * GET /api/businesses
 * Returns all unique business documents.
 */
app.get('/api/businesses', async (_req, res) => {
  try {
    const businesses = await Business.find({}, '_id name').sort({ name: 1 }).lean();
    res.json(businesses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Categories ────────────────────────────────────────────────────────────────

/**
 * GET /api/businesses/:id/categories
 * Returns all categories belonging to a specific business.
 */
app.get('/api/businesses/:id/categories', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid business id' });
    }
    const categories = await Category.find(
      { businessId: req.params.id },
      '_id name businessId'
    ).sort({ name: 1 }).lean();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Services ──────────────────────────────────────────────────────────────────

/**
 * GET /api/categories/:id/services
 * Returns all services belonging to a specific category.
 */
app.get('/api/categories/:id/services', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid category id' });
    }
    const services = await Service.find(
      { categoryId: req.params.id },
      '_id serviceName description benefits categoryId businessId'
    ).sort({ serviceName: 1 }).lean();
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/services
 * Returns all services across all businesses, each populated with its
 * category name and business name for display purposes.
 */
app.get('/api/services', async (_req, res) => {
  try {
    const services = await Service.find()
      .populate('categoryId', 'name')
      .populate('businessId', 'name')
      .sort({ serviceName: 1 })
      .lean();
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/services/:id
 * Returns a single service by its _id.
 */
app.get('/api/services/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid service id' });
    }
    const service = await Service.findById(req.params.id).lean();
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Inquiries ─────────────────────────────────────────────────────────────────

/**
 * POST /api/inquiries
 * Records a user's interest in a specific service.
 * Body: { email, serviceId, isGuest? }
 * Looks up the service to denormalise serviceName, categoryName, businessName.
 */
app.post('/api/inquiries', async (req, res) => {
  try {
    const { email, serviceId, isGuest = false } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'email is required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (!serviceId || !mongoose.isValidObjectId(serviceId)) {
      return res.status(400).json({ error: 'Valid serviceId is required' });
    }

    const service = await Service
      .findById(serviceId)
      .populate('categoryId', 'name')
      .populate('businessId', 'name')
      .lean();

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const inquiry = await Inquiry.create({
      email:        email.trim().toLowerCase(),
      isGuest:      Boolean(isGuest),
      serviceId:    service._id,
      serviceName:  service.serviceName,
      categoryId:   service.categoryId?._id   ?? null,
      categoryName: service.categoryId?.name  ?? '',
      businessId:   service.businessId?._id   ?? null,
      businessName: service.businessId?.name  ?? '',
    });

    res.status(201).json({
      _id:          inquiry._id,
      email:        inquiry.email,
      serviceName:  inquiry.serviceName,
      businessName: inquiry.businessName,
      createdAt:    inquiry.createdAt,
    });
  } catch (err) {
    // Duplicate or validation errors surface as 400
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function start() {
  if (!MONGO_URI) throw new Error('MONGO_URI is not defined in your .env file.');

  console.log('Connecting to MongoDB Atlas…');
  await mongoose.connect(MONGO_URI, {
    serverApi: { version: '1', strict: true, deprecationErrors: true },
  });
  console.log('Connected.\n');

  app.listen(PORT, () => {
    console.log(`API server running at http://localhost:${PORT}`);
    console.log(`  GET /api/businesses`);
    console.log(`  GET /api/businesses/:id/categories`);
    console.log(`  GET /api/categories/:id/services`);
    console.log(`  GET /api/services`);
    console.log(`  GET /api/services/:id`);
    console.log(`  POST /api/inquiries`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exitCode = 1;
});
