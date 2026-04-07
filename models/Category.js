'use strict';

const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// A category name must be unique within a business
CategorySchema.index({ name: 1, businessId: 1 }, { unique: true });

module.exports = mongoose.model('Category', CategorySchema);
