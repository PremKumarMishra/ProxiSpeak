const mongoose = require('mongoose');

const userPositionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    organization_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
        required: true
      },
      coordinates: {
        type: [Number], // [x, y] coordinates in 2D space
        required: true,
        validate: {
          validator: function (val) {
            return val.length === 2;
          },
          message: 'Coordinates must be an array of 2 numbers [x, y]'
        }
      }
    },
    last_active: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Indexes
//Indexing Legeacy 2D Spatial Queries ($near,$geoWithin)
userPositionSchema.index({ location: '2d' });
//Indexing And Guaranting 1 Active Position Record Per User Per Organization
userPositionSchema.index({ organization_id: 1, user_id: 1 }, { unique: true });
module.exports = mongoose.model('UserPosition', userPositionSchema);