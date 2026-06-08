const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  await mongoose.connect(uri);
  console.log('MongoDB connected');
};

module.exports = connectDB;
