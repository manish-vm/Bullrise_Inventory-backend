require('./config/dns');
const app = require('./app');
const connectDB = require('./config/db');
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`API running on ${PORT}`));

connectDB().catch((error) => {
  console.error('MongoDB connection failed:', error.message);
});
