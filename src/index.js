const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// eBay API Search Function (built-in)
async function searchEbay(keyword) {
  try {
    const EBAY_APP_ID = process.env.EBAY_APP_ID;
    
    if (!EBAY_APP_ID) {
      console.log('No eBay API key - using estimates');
      return null;
    }

    const params = new URLSearchParams({
      'OPERATION-NAME': 'findCompletedItems',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': EBAY_APP_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'REST-PAYLOAD': '',
      'keywords': keyword,
      'itemFilter(0).name': 'SoldItemsOnly',
      'itemFilter(0).value': 'true',
      'itemFilter(1).name': 'ListingType',
      'itemFilter(1).value': 'FixedPrice',
      'sortOrder': 'EndTimeSoonest',
      'paginationInput.entriesPerPage': '100'
    });

    const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params}`;
    const response = await axios.get(url);

    const searchResult = response.data.findCompletedItemsResponse?.[0]?.searchResult?.[0];
    
    if (!searchResult || searchResult['@count'] === '0') {
      return null;
    }

    const items = searchResult.item || [];
    const prices = items
      .filter(item => item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__)
      .map(item => parseFloat(item.sellingStatus[0].currentPrice[0].__value__));
    
    if (prices.length === 0) {
      return null;
    }

    const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const soldCount = items.length;

    return {
      keyword,
      avgPrice: avgPrice.toFixed(2),
      soldCount,
      minPrice: Math.min(...prices).toFixed(2),
      maxPrice: Math.max(...prices).toFixed(2)
    };

  } catch (error) {
    console.error(`eBay search error for "${keyword}":`, error.message);
    return null;
  }
}

// Supplier Price Estimator (built-in)
function getSupplierPrice(keyword) {
  const estimatedPrices = {
    'phone': 5, 'case': 2, 'cable': 1.5, 'led': 3, 'light': 4,
    'speaker': 8, 'holder': 2, 'organizer': 3, 'mat': 5,
    'bottle': 3, 'band': 2, 'brush': 1.5, 'sunglasses': 3,
    'jewelry': 2, 'watch': 8, 'bluetooth': 6, 'charging': 2
  };

  const lowerKeyword = keyword.toLowerCase();
  for (const [key, price] of Object.entries(estimatedPrices)) {
    if (lowerKeyword.includes(key)) {
      const variance = (Math.random() - 0.5) * 0.6;
      return (price * (1 + variance)).toFixed(2);
    }
  }

  return '5.00';
}

// Health Check
app.get('/', (req, res) => {
  res.json({ 
    status: 'running',
    message: 'Product Finder API is active',
    ebayConfigured: !!process.env.EBAY_APP_ID,
    timestamp: new Date().toISOString()
  });
});

// Product Scan Endpoint
app.post('/api/scan', async (req, res) => {
  try {
    const keywords = [
      'phone case', 'led strip lights', 'bluetooth speaker', 
      'phone holder', 'charging cable', 'car phone mount',
      'bluetooth headphones', 'phone ring holder'
    ];
    
    const findings = [];
    
    console.log('🔍 Starting product scan...');
    
    for (const keyword of keywords) {
      try {
        console.log(`   Searching: ${keyword}`);
        
        const ebayData = await searchEbay(keyword);
        
        if (!ebayData) {
          console.log(`   ❌ No data for: ${keyword}`);
          continue;
        }
        
        const supplierPrice = parseFloat(getSupplierPrice(keyword));
        const sellPrice = parseFloat(ebayData.avgPrice);
        const ebayFee = sellPrice * 0.1325;
        const paymentFee = sellPrice * 0.0349;
        const shipping = 3.00;
        
        const totalCosts = supplierPrice + ebayFee + paymentFee + shipping;
        const profit = sellPrice - totalCosts;
        const margin = (profit / sellPrice) * 100;
        
        console.log(`   💰 ${keyword}: Profit $${profit.toFixed(2)} (${margin.toFixed(1)}%)`);
        
        if (profit >= 10 && margin >= 25) {
          const competition = ebayData.soldCount > 300 ? 'High' : 
                            ebayData.soldCount > 100 ? 'Medium' : 'Low';
          
          findings.push({
            name: keyword.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            category: 'Electronics',
            buyPrice: supplierPrice.toFixed(2),
            sellPrice: sellPrice.toFixed(2),
            profit: profit.toFixed(2),
            margin: margin.toFixed(1),
            competition,
            soldCount: ebayData.soldCount,
            ebaySearchUrl: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(keyword)}&LH_Sold=1&LH_Complete=1`,
            aliexpressUrl: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(keyword)}`,
            timestamp: new Date().toISOString()
          });
          
          console.log(`   ✅ Added to findings!`);
        } else {
          console.log(`   ⚠️  Below threshold (profit: $${profit.toFixed(2)}, margin: ${margin.toFixed(1)}%)`);
        }
        
        // Rate limiting - wait 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`   ❌ Error with ${keyword}:`, error.message);
      }
    }
    
    console.log(`✅ Scan complete! Found ${findings.length} profitable products\n`);
    
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 eBay API: ${process.env.EBAY_APP_ID ? 'Configured ✅' : 'Not configured ⚠️'}`);
  console.log(`💰 Ready to find profitable products!`);
});