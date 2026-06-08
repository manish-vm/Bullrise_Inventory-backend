require('./config/dns');
const app = require('./app');
const connectDB = require('./config/db');
const PORT = process.env.PORT || 5000;
connectDB().then(() => app.listen(PORT, () => console.log(`API running on ${PORT}`)));
