import mongoose from 'mongoose';

//Schema To Store Activity
const activitySchema = new mongoose.Schema(
    {
        title : {
            type:String,
            required: true,
            trim:true
        },
        description : {
            type:String,
            required:true,
            trim:true
        }
    },
    {
        timestamps:true
    }
);

const userSchema = new mongoose.Schema(
  {
    firebase_uid: {
        type: String,
        required: [true, 'Firebase UID is required'],
        unique: true,
        index: true
    },
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters long']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address']
    },
    avatar_url : {
        type: String,
        trim:true

    },
    organizations: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Organization'
        }
    ],
    activities : [activitySchema],
    joined_at: {
        type: Date,
        default: Date.now
    }
  },
  {
        timestamps: true
  }
);

const User = mongoose.model('User', userSchema);
export default User;