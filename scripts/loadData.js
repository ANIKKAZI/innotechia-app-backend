'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path      = require('path');
const XLSX      = require('xlsx');
const mongoose  = require('mongoose');

const Business  = require('../models/Business');
const Category  = require('../models/Category');
const Service   = require('../models/Service');

// ── Configuration ─────────────────────────────────────────────────────────────

const MONGO_URI  = process.env.MONGO_URI;
const EXCEL_FILE = path.join(__dirname, '..', 'restaurant_services.xlsx');

// ── Validation ────────────────────────────────────────────────────────────────

function validateRow(row, index) {
  const required = ['Business Type', 'Category', 'Service Name'];
  for (const field of required) {
    if (!row[field] || String(row[field]).trim() === '') {
      console.warn(`  [row ${index + 2}] Skipping — missing required field: "${field}"`);
      return false;
    }
  }
  return true;
}

// ── Database helpers ──────────────────────────────────────────────────────────

/**
 * Upsert a Business by name. Returns the document.
 */
async function upsertBusiness(name) {
  return Business.findOneAndUpdate(
    { name },
    { name },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
}

/**
 * Upsert a Category by (name, businessId). Returns the document.
 */
async function upsertCategory(name, businessId) {
  return Category.findOneAndUpdate(
    { name, businessId },
    { name, businessId },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
}

/**
 * Upsert a Service by (serviceName, categoryId). Returns the document.
 */
async function upsertService({ serviceName, description, benefits, categoryId, businessId }) {
  return Service.findOneAndUpdate(
    { serviceName, categoryId },
    { serviceName, description, benefits, categoryId, businessId },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
}

// ── Core loader ───────────────────────────────────────────────────────────────

async function loadData() {
  // ── 1. Connect ──────────────────────────────────────────────────────────────
  if (!MONGO_URI) {
    throw new Error('MONGO_URI is not defined in your .env file.');
  }

  console.log('Connecting to MongoDB Atlas…');
  await mongoose.connect(MONGO_URI, {
    serverApi: {
      version: '1',
      strict: true,
      deprecationErrors: true,
    },
  });
  console.log('Connected.\n');

  // ── 2. Read Excel ───────────────────────────────────────────────────────────
  console.log(`Reading: ${EXCEL_FILE}`);
  const workbook  = XLSX.readFile(EXCEL_FILE);
  const sheetName = workbook.SheetNames[0];
  const rows      = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
  console.log(`Found ${rows.length} rows in sheet "${sheetName}".\n`);

  // ── 3. Upsert Businesses ────────────────────────────────────────────────────
  const rawBusinessNames = [...new Set(
    rows
      .map((r) => String(r['Business Type'] || '').trim())
      .filter(Boolean),
  )];

  console.log(`--- Businesses (${rawBusinessNames.length}) ---`);
  const bizMap = {}; // name → ObjectId

  for (const name of rawBusinessNames) {
    const doc = await upsertBusiness(name);
    bizMap[name] = doc._id;
    console.log(`  ✓ ${name}`);
  }

  // ── 4. Upsert Categories ────────────────────────────────────────────────────
  const rawCategories = [
    ...new Map(
      rows
        .filter((r) => r['Business Type'] && r['Category'])
        .map((r) => {
          const biz = String(r['Business Type']).trim();
          const cat = String(r['Category']).trim();
          return [`${biz}||${cat}`, { biz, cat }];
        }),
    ).values(),
  ];

  console.log(`\n--- Categories (${rawCategories.length}) ---`);
  // key: "bizName||catName" → ObjectId
  const catMap = {};

  for (const { biz, cat } of rawCategories) {
    const businessId = bizMap[biz];
    if (!businessId) {
      console.warn(`  ⚠ No businessId for "${biz}" — skipping category "${cat}"`);
      continue;
    }
    const doc = await upsertCategory(cat, businessId);
    catMap[`${biz}||${cat}`] = doc._id;
    console.log(`  ✓ [${biz}] → ${cat}`);
  }

  // ── 5. Upsert Services ──────────────────────────────────────────────────────
  console.log('\n--- Services ---');
  let inserted = 0;
  let skipped  = 0;

  for (const [index, row] of rows.entries()) {
    if (!validateRow(row, index)) {
      skipped++;
      continue;
    }

    const bizName     = String(row['Business Type']).trim();
    const catName     = String(row['Category']).trim();
    const serviceName = String(row['Service Name']).trim();
    const description = String(row['Description'] || '').trim();
    const benefits    = String(row['Benefits']    || '').trim();

    const businessId = bizMap[bizName];
    const categoryId = catMap[`${bizName}||${catName}`];

    if (!businessId || !categoryId) {
      console.warn(`  ⚠ Missing reference for row ${index + 2} ("${serviceName}") — skipping.`);
      skipped++;
      continue;
    }

    await upsertService({ serviceName, description, benefits, categoryId, businessId });
    console.log(`  ✓ ${serviceName}`);
    inserted++;
  }

  // ── 6. Summary ──────────────────────────────────────────────────────────────
  const [bizCount, catCount, svcCount] = await Promise.all([
    Business.countDocuments(),
    Category.countDocuments(),
    Service.countDocuments(),
  ]);

  console.log('\n─────────────────────────────────');
  console.log('Load complete.');
  console.log(`  Businesses : ${bizCount}`);
  console.log(`  Categories : ${catCount}`);
  console.log(`  Services   : ${svcCount} (rows skipped: ${skipped})`);
  console.log('─────────────────────────────────\n');
}

// ── Entry point ───────────────────────────────────────────────────────────────

loadData()
  .catch((err) => {
    console.error('\nFatal error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
