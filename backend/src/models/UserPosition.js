import mongoose from 'mongoose';

const userPositionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true
    },
    organization_id: {
      type: String,
      required: true,
      index: true
    },
    socket_id: {
      type: String,
      required: false
    },
    uid: {
      type: String,
      required: false
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
// Indexing 2D & 2D Sphere Spatial Queries ($near, $geoWithin)
userPositionSchema.index({ location: '2dsphere' });
userPositionSchema.index({ 'location.coordinates': '2d' });
userPositionSchema.index({ organization_id: 1, uid: 1 });

const UserPosition = mongoose.models.UserPosition || mongoose.model('UserPosition', userPositionSchema);
export default UserPosition;
