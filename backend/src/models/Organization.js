import mongoose from 'mongoose';

// SubSchema For Wall Segments
const wallSchema = new mongoose.Schema(
  {
    x1: { type: Number, required: true },
    y1: { type: Number, required: true },
    x2: { type: Number, required: true },
    y2: { type: Number, required: true }
  },
  { _id: false }
);

// SubSchema For Organization Members
const memberSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      default: 'member'
    },
    joined_at: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true
    },
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    members: [memberSchema],
    blueprint: {
      dimensions: {
        width: { type: Number, default: 1920 },
        height: { type: Number, default: 1080 }
      },
      walls: [wallSchema],
      obstacles: [mongoose.Schema.Types.Mixed]
    },
    officeLayout: {
      type: mongoose.Schema.Types.Mixed
    },
    created_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

//Indexing For Finding User's Joined Organizations Quickly
organizationSchema.index({ 'members.user_id': 1 });

const Organization = mongoose.model('Organization', organizationSchema);
export default Organization;