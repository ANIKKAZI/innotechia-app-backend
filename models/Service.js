'use strict';

const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema(
  {
    serviceName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    benefits: {
      type: String,
      default: '',
      trim: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
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

// A service name must be unique within a category
ServiceSchema.index({ serviceName: 1, categoryId: 1 }, { unique: true });

module.exports = mongoose.model('Service', ServiceSchema);
