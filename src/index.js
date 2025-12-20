const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// =====================================================
// RATE LIMITER CLASS
// =====================================================
class RateLimiter {
  constructor() {
    this.callHistory = [];
    this.lastCallTime = 0;
    this.config = {
      DELAY_BETWEEN_CALLS: 3000,  // 3 seconds
      MAX_CALLS_PER_HOUR: 80,
      MAX_CALLS_PER_DAY: 4000
    };
  }

  async waitIfNeeded() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    
    if (timeSinceLastCall < this.config.DELAY_BETWEEN_CALLS) {
      const waitTime = this.config.DELAY_BETWEEN_CALLS - timeSinceLastCall;
      console.log(`   ⏳ Waiting ${Math.round(waitTime/1000)}s...`);
      await this.sleep(waitTime);
    }
    
    const oneHourAgo = now - (60 * 60 * 1000);
    this.callHistory = this.callHistory.filter(time => time > oneHourAgo);
    
    if (this.callHistory.length >= this.config.MAX_CALLS_PER_HOUR) {
      const oldestCall = Math.min(...this.callHistory);
      const waitUntil = oldestCall + (60 * 60 * 1000);
      const waitTime = waitUntil - now;
      console.log(`   ⚠️  Hourly limit reached. Waiting ${Math.ceil(waitTime / 1000 / 60)} minutes...`);
      await this.sleep(waitTime);
    }
    
    this.callHistory.push(now);
    this.lastCallTime = now;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    const hourly = this.callHistory.filter(time => time > oneHourAgo).length;
    const daily = this.callHistory.filter(time => time > oneDayAgo).length;
    
    return {
      hourly: `${hourly}/${this.config.MAX_CALLS_PER_HOUR}`,
      daily: `${daily}/${this.config.MAX_CALLS_PER_DAY}`,
      remainingHourly: this.config.MAX_CALLS_PER_HOUR - hourly
    };
  }
}

// =====================================================
// CACHE MANAGER CLASS
// =====================================================
class CacheManager {
  constructor() {
    this.cache = {};
    this.cacheFile = path.join(__dirname, 'ebay_cache.json');
    this.cacheDuration = 24 * 60 * 60 * 1000;
  }

  async load() {
    try {
      const data = await fs.readFile(this.cacheFile, 'utf8');
      this.cache = JSON.parse(data);
      console.log(`📦 Loaded ${Object.keys(this.cache).length} cached items`);
    } catch (error) {
      this.cache = {};
    }
  }

  async save() {
    try {
      await fs.writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      console.error('Cache save error:', error.message);
    }
  }

  get(keyword) {
    const entry = this.cache[keyword];
    if (!entry) return null;
    
    const cacheAge = Date.now() - entry.timestamp;
    if (cacheAge > this.cacheDuration) {
      delete this.cache[keyword];
      return null;
    }
    
    const ageMinutes = Math.round(cacheAge / 1000 / 60);
    console.log(`   ✅ Cache hit (${ageMinutes}m old)`);
    return entry.data;
  }

  set(keyword, data) {
    this.cache[keyword] = {
      timestamp: Date.now(),
      data: data
    };
  }
}

const rateLimiter = new RateLimiter();
const cacheManager = new CacheManager();

// eBay API Search Function
async function searchEbay(keyword) {
  try {
    const cachedData = cacheManager.get(keyword);
    if (cachedData) return cachedData;

    const EBAY_APP_ID = process.env.EBAY_APP_ID;
    if (!EBAY_APP_ID) {
      console.log('⚠️  No eBay API key');
      return null;
    }

    await rateLimiter.waitIfNeeded();

    console.log(`   🔍 ${keyword}`);

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
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'ProductFinderBot/1.0' }
    });

    if (response.data.errorMessage) {
      console.error(`   ❌ API Error:`, response.data.errorMessage[0].error[0].message[0]);
      return null;
    }

    const searchResult = response.data.findCompletedItemsResponse?.[0]?.searchResult?.[0];
    if (!searchResult || searchResult['@count'] === '0') {
      console.log(`   ℹ️  No results`);
      return null;
    }

    const items = searchResult.item || [];
    const prices = items
      .filter(item => item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__)
      .map(item => parseFloat(item.sellingStatus[0].currentPrice[0].__value__));
    
    if (prices.length === 0) return null;

    const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const soldCount = items.length;

    const result = {
      keyword,
      avgPrice: avgPrice.toFixed(2),
      soldCount,
      minPrice: Math.min(...prices).toFixed(2),
      maxPrice: Math.max(...prices).toFixed(2)
    };

    cacheManager.set(keyword, result);
    const stats = rateLimiter.getStats();
    console.log(`   ✅ $${result.avgPrice} avg | API: ${stats.hourly}`);

    return result;

  } catch (error) {
    if (error.response) {
      console.error(`   ❌ Status ${error.response.status}`);
      if (error.response.data) {
        console.error(`   ${JSON.stringify(error.response.data)}`);
      }
    } else {
      console.error(`   ❌ ${error.message}`);
    }
    return null;
  }
}

function getSupplierPrice(keyword) {
  const estimatedPrices = {
    'phone': 5, 'case': 2, 'cable': 1.5, 'led': 3, 'light': 4,
    'speaker': 8, 'holder': 2, 'organizer': 3, 'mat': 5,
    'bottle': 3, 'band': 2, 'brush': 1.5, 'sunglasses': 3,
    'jewelry': 2, 'watch': 8, 'bluetooth': 6, 'charging': 2,
    'ring': 1, 'clip': 0.80, 'mount': 3, 'eyelash': 3.5,
    'makeup': 1.8, 'blender': 8.5, 'drawer': 2.8, 'resistance': 4.5
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

app.get('/', (req, res) => {
  const stats = rateLimiter.getStats();
  res.json({ 
    status: 'running',
    message: 'Product Finder API',
    ebayConfigured: !!process.env.EBAY_APP_ID,
    rateLimiting: { enabled: true, hourlyUsage: stats.hourly },
    cache: { enabled: true, entries: Object.keys(cacheManager.cache).length },
    timestamp: new Date().toISOString()
  });
});

app.post('/api/scan', async (req, res) => {
  try {
    const keywords = [
      'phone ring holder',
      'cable organizer clips', 
      'silicone phone case',
      'car phone mount',
      'magnetic eyelashes',
      'reusable makeup remover pads',
      'resistance bands set',
      'led strip lights',
      'drawer organizer',
      'portable blender'
    ];
    
    const findings = [];
    console.log('\n🔍 Scanning products...');
    const startTime = Date.now();
    
    for (const keyword of keywords) {
      try {
        const ebayData = await searchEbay(keyword);
        if (!ebayData) continue;
        
        const supplierPrice = parseFloat(getSupplierPrice(keyword));
        const sellPrice = parseFloat(ebayData.avgPrice);
        const ebayFee = sellPrice * 0.1325;
        const paymentFee = sellPrice * 0.0349;
        const shipping = 3.00;
        
        const totalCosts = supplierPrice + ebayFee + paymentFee + shipping;
        const profit = sellPrice - totalCosts;
        const margin = (profit / sellPrice) * 100;
        
        if (profit >= 5 && margin >= 20) {
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
        }
      } catch (error) {
        console.error(`   ❌ ${keyword}: ${error.message}`);
      }
    }
    
    await cacheManager.save();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Done! Found ${findings.length} products (${duration}s)\n`);
    
    res.json({ 
      success: true, 
      findings,
      count: findings.length,
      scanDuration: duration,
      stats: rateLimiter.getStats(),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ error: error.message, success: false });
  }
});

const PORT = process.env.PORT || 3001;

async function startServer() {
  await cacheManager.load();
  app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  Product Finder API - FIXED! ✅        ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`🚀 Port: ${PORT}`);
    console.log(`🔑 eBay: ${process.env.EBAY_APP_ID ? 'Connected' : 'Missing'}`);
    console.log(`⏱️  Rate Limit: 3s delay, 80/hour`);
    console.log(`💾 Cache: 24 hours\n`);
  });
}

startServer();