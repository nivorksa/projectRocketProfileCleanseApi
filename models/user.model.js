import mongoose from 'mongoose';
const { Schema } = mongoose;

const userSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },

  name: {
    type: String,
    required: true,
  },

  email: {
    type: String,
    required: true,
    unique: true,
  },

  password: {
    type: String,
    required: true,
  },

  img: {
    type: String,
    required: false,
    default: '',
  },

  country: {
    type: String,
    required: true,
  },

  phone: {
    type: String,
    required: true,
  },

  role: {
    type: String,
    enum: ['buyer', 'seller'],
    default: 'buyer',
  },

  sellerProfileId: { 
    type: Schema.Types.ObjectId,
    ref: 'SellerProfile',
  },

  buyerProfileId: { 
    type: Schema.Types.ObjectId,
    ref: 'BuyerProfile',
  },
  
}, {
    timestamps: true
});

export default mongoose.model("User", userSchema);