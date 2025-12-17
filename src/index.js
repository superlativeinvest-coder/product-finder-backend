const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();

const { scanProducts } = require('./services/scanner');
const { initDatabase } = require('./db/database');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
initDatabase().catch(console.error);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'running',
    message: 'Product Finder API is active',
    timestamp: new Date().toISOString()
  });
});

// Manual scan endpoint
app.post('/api/scan', async (req, res) => {
  try {
    const config = {
      minProfit: parseFloat(req.body.minProfit || process.env.MIN_PROFIT || 10),
      minMargin: parseFloat(req.body.minMargin || process.env.MIN_MARGIN || 25),
      categories: req.body.categories || ['Electronics', 'Home & Garden', 'Fashion']
    };

    console.log('Starting manual scan with config:', config);
    const findings = await scanProducts(config);
    
    res.json({ 
      success: true, 
      findings,
      count: findings.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ 
      error: error.message,
      success: false 
    });
  }
});

// Configure email alerts endpoint
app.post('/api/alerts/configure', async (req, res) => {
  try {
    const { email, alertsEnabled, minAlertProfit, minAlertMargin } = req.body;
    console.log('Alert configuration:', { email, alertsEnabled, minAlertProfit, minAlertMargin });
    
    res.json({ 
      success: true, 
      message: 'Alerts configured successfully' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Automated scanning
const scanInterval = parseInt(process.env.SCAN_INTERVAL_HOURS || 6);
cron.schedule(`0 */${scanInterval} * * *`, async () => {
  console.log(`Running automated scan at ${new Date().toISOString()}`);
  try {
    const config = {
      minProfit: parseFloat(process.env.MIN_PROFIT || 10),
      minMargin: parseFloat(process.env.MIN_MARGIN || 25),
      categories: ['Electronics', 'Home & Garden', 'Fashion', 'Sports', 'Beauty']
    };
    
    const findings = await scanProducts(config);
    console.log(`Automated scan complete. Found ${findings.length} products.`);
  } catch (error) {
    console.error('Automated scan error:', error);
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Automated scans every ${scanInterval} hours`);
  console.log(`💰 Min profit: $${process.env.MIN_PROFIT || 10}`);
  console.log(`📈 Min margin: ${process.env.MIN_MARGIN || 25}%`);
});