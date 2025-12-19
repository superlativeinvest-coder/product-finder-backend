const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ 
    status: 'running',
    message: 'Product Finder API is active',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/scan', async (req, res) => {
  try {
    console.log('Scan requested');
    
    const sampleProducts = [
      {
        name: 'Phone Case',
        category: 'Electronics',
        buyPrice: '3.50',
        sellPrice: '19.99',
        profit: '12.45',
        margin: '62.3',
        competition: 'Low',
        soldCount: 150,
        timestamp: new Date().toISOString()
      },
      {
        name: 'LED Strip Lights',
        category: 'Electronics',
        buyPrice: '5.99',
        sellPrice: '24.99',
        profit: '14.50',
        margin: '58.0',
        competition: 'Medium',
        soldCount: 220,
        timestamp: new Date().toISOString()
      }
    ];
    
    res.json({ 
      success: true, 
      findings: sampleProducts,
      count: sampleProducts.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: error.message,
      success: false 
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
```