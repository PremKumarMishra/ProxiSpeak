import mongoose from 'mongoose';

// Subschema For Individual Object Layout
const objectSchema = new mongoose.Schema(
    {
        id: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            default: 'furniture',
        },
        obj_type: {
            type: String,
            default: 'furniture',
        },
        name: {
            type: String,
            default: 'Office Object',
        },
        position: {
            x: { type: Number, default: 0 },
            y: { type: Number, default: 0 },
        },
        x: {
            type: Number,
        },
        y: {
            type: Number,
        },
        rotation: {
            type: Number,
            default: 0,
        },
        width: {
            type: Number,
            default: 40,
        },
        height: {
            type: Number,
            default: 20,
        },
        isSolid: {
            type: Boolean,
            default: true,
        },
        canPass: {
            type: Boolean,
            default: false,
        },
        soundBarrier: {
            type: Boolean,
            default: false,
        },
        category: {
            type: String,
            default: 'Furniture',
        },
        icon: {
            type: String,
            default: '📦',
        },
        color: {
            type: String,
            default: '#cbd5e1',
        },
        custom: {
            type: Boolean,
            default: false,
        },
    },
    {
        _id: false,
        strict: false,
    }
);

// Subschema For Office Layout 
const layoutSchema = new mongoose.Schema(
    {
        version: {
            type: Number,
            default: 1,
        },
        objects: [objectSchema],
    },
    {
        _id: false,
        strict: false,
    }
);

// SubSchema For Organization Members
const memberSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'member'],
      default: 'member',
    },
    joined_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
    },
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    members: [memberSchema],
    office_layout: {
      type: layoutSchema,
      default: () => ({ version: 1, objects: [] }),
    },
    created_at: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Indexing For Finding User's Joined Organizations Quickly
organizationSchema.index({ 'members.user_id': 1 });

const Organization = mongoose.model('Organization', organizationSchema);
export default Organization;
