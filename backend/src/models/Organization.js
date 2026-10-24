import mongoose from 'mongoose';

//Subschema For Object Layout
const objectSchema = new mongoose.Schema(
    {
        id: {
            type:String,
            required:true,
        },
        obj_type:
        {
            type:String,
            required:true,
        },
        name: {
            type:String,
            required:true,
        },
        position:
        {
            x: {type:Number,required:true},
            y:{type:Number,required:true}
        },
        rotation: {
            type:Number,
            required:true
        },
        "width":{
            type:Number,
            required:true
        },
        "height": {
            type:Number,
            required:true
        },
        "isSolid": {
            type:Boolean,
            required:true
        },
        "canPass": {
            type:Boolean,
            required:true
        },
        "custom": {
            type:Boolean,
            required:true
        },
    },
    {
        _id:false
    }
)

//Subschema For Office Layout 
const layoutSchema = new mongoose.Schema(
    {
        version : 
        {
            type:Number,
            required:true,
        },
        objects : [objectSchema]
    },
    {
        _id:false
    }
)
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
      enum: ['owner', 'member'],
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
    office_layout: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({ version: 1, objects: [] })
    },
    created_at: {type: Date, default: Date.now}
  },
  {
    timestamps: true
  }
);

//Indexing For Finding User's Joined Organizations Quickly
organizationSchema.index({ 'members.user_id': 1 });

const Organization = mongoose.model('Organization', organizationSchema);
export default Organization;