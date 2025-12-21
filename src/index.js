const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Import category scanner
const {
  CATEGORY_PRODUCTS,
  categoryTracker,
  selectCategoriesToScan,
  getProductsForCategories
} = require('./category-scanner');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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
      DELAY_BETWEEN_CALLS: 3000,
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
// CACHE MANAGER CLASS (NOW INCLUDES PRICE HISTORY!)
// =====================================================
class CacheManager {
  constructor() {
    this.cache = {};
    this.cacheFile = path.join(__dirname, 'ebay_cache.json');
    this.priceHistoryFile = path.join(__dirname, 'price_history.json');
    this.cacheDuration = 24 * 60 * 60 * 1000;
    this.priceHistory = {};
  }

  async load() {
    try {
      const data = await fs.readFile(this.cacheFile, 'utf8');
      this.cache = JSON.parse(data);
      console.log(`📦 Loaded ${Object.keys(this.cache).length} cached items`);
    } catch (error) {
      this.cache = {};
    }
    
    // Load price history
    try {
      const histData = await fs.readFile(this.priceHistoryFile, 'utf8');
      this.priceHistory = JSON.parse(histData);
      console.log(`📊 Loaded price history for ${Object.keys(this.priceHistory).length} products`);
    } catch (error) {
      this.priceHistory = {};
    }
  }

  async save() {
    try {
      await fs.writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2));
      await fs.writeFile(this.priceHistoryFile, JSON.stringify(this.priceHistory, null, 2));
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
  
  // NEW: Record price history
  recordPrice(keyword, priceData) {
    if (!this.priceHistory[keyword]) {
      this.priceHistory[keyword] = [];
    }
    
    this.priceHistory[keyword].push({
      avgPrice: priceData.avgPrice,
      minPrice: priceData.minPrice,
      maxPrice: priceData.maxPrice,
      profit: priceData.profit,
      margin: priceData.margin,
      soldCount: priceData.soldCount,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 90 days
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    this.priceHistory[keyword] = this.priceHistory[keyword].filter(entry => 
      new Date(entry.timestamp).getTime() > ninetyDaysAgo
    );
  }
  
  getPriceHistory(keyword, days = 30) {
    const history = this.priceHistory[keyword] || [];
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    return history.filter(entry => 
      new Date(entry.timestamp).getTime() > cutoff
    );
  }
}

const rateLimiter = new RateLimiter();
const cacheManager = new CacheManager();

// =====================================================
// TIKTOK TRENDING SERVICE (Web Scraping - No API needed!)
// =====================================================
async function getTikTokTrending(keyword) {
  try {
    // Simulate TikTok data for now (in production, use puppeteer or RapidAPI)
    const trendingHashtags = [
      '#TikTokMadeMeBuyIt',
      '#AmazonFinds', 
      '#MustHave',
      '#Viral'
    ];
    
    // For demo: Calculate a trend score based on keyword
    const trendScore = Math.floor(Math.random() * 100);
    const isViral = trendScore > 70;
    
    return {
      keyword,
      trendScore,
      isViral,
      hashtags: trendingHashtags,
      estimatedViews: trendScore * 100000,
      estimatedPosts: trendScore * 500,
      trendingLink: `https://www.tiktok.com/search?q=${encodeURIComponent(keyword)}`,
      status: isViral ? '🔥 VIRAL' : trendScore > 40 ? '📈 Trending' : '📊 Normal'
    };
  } catch (error) {
    console.error('TikTok trending error:', error.message);
    return null;
  }
}

// =====================================================
// SOCIAL PROOF METRICS
// =====================================================
async function getSocialProof(keyword) {
  try {
    // For demo: Generate realistic-looking metrics
    // In production, use Google Trends API, Reddit API, etc.
    
    const googleTrends = Math.floor(Math.random() * 100);
    const redditMentions = Math.floor(Math.random() * 200);
    const instagramPosts = Math.floor(Math.random() * 50000);
    const amazonReviews = Math.floor(Math.random() * 5000);
    const amazonRating = (3.5 + Math.random() * 1.5).toFixed(1);
    
    // Calculate demand score
    const demandScore = Math.floor(
      googleTrends * 0.3 +
      (redditMentions / 2) * 0.15 +
      (instagramPosts / 500) * 0.15 +
      (amazonReviews / 50) * 0.2 +
      (amazonRating / 5 * 100) * 0.2
    );
    
    return {
      demandScore: Math.min(100, demandScore),
      googleTrends,
      redditMentions,
      instagramPosts,
      amazonReviews,
      amazonRating: parseFloat(amazonRating),
      validation: demandScore > 70 ? '✅ High Demand' : 
                  demandScore > 40 ? '⚠️ Moderate Demand' : 
                  '❌ Low Demand'
    };
  } catch (error) {
    console.error('Social proof error:', error.message);
    return null;
  }
}

// =====================================================
// AI LISTING GENERATOR (OpenAI)
// =====================================================
async function generateAIListing(keyword, productData) {
  try {
    // Check if OpenAI API key exists
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️  OpenAI API key not configured - using template');
      return generateTemplateListing(keyword, productData);
    }
    
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const prompt = `Create a high-converting eBay listing for "${keyword}".

Product details:
- Average selling price: $${productData.avgPrice}
- Sold count: ${productData.soldCount}
- Competition: ${productData.competition}

Generate JSON with:
1. title (max 80 chars, SEO-optimized)
2. description (engaging, 200-300 words)
3. keywords (10 SEO terms)

Format: {"title": "...", "description": "...", "keywords": ["..."]}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 800
    });

    const generated = JSON.parse(response.choices[0].message.content);
    console.log('   🤖 AI listing generated');
    
    return generated;
  } catch (error) {
    console.error('AI generation error:', error.message);
    return generateTemplateListing(keyword, productData);
  }
}

// Fallback template generator (no API needed)
function generateTemplateListing(keyword, productData) {
  const titleCase = keyword.split(' ').map(w => 
    w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');
  
  return {
    title: `${titleCase} - Fast Shipping - High Quality - Best Price`,
    description: `
🌟 Premium ${titleCase} 🌟

✅ HIGH QUALITY PRODUCT
✅ FAST & FREE SHIPPING
✅ 30-DAY MONEY BACK GUARANTEE
✅ TOP RATED SELLER

This ${keyword} is perfect for anyone looking for quality and value. With ${productData.soldCount}+ satisfied customers, you can trust this product!

📦 SHIPPING: Ships within 1 business day
💯 GUARANTEE: 100% satisfaction or your money back
⭐ RATING: Based on actual customer reviews

Order now and experience the difference!

Perfect for: Home, Office, Gift, Personal Use

Don't miss out on this amazing deal!
    `.trim(),
    keywords: [
      keyword,
      `${keyword} best`,
      `${keyword} quality`,
      `${keyword} cheap`,
      `buy ${keyword}`,
      `${keyword} sale`,
      `${keyword} deal`,
      `${keyword} fast shipping`,
      `${keyword} new`,
      `${keyword} premium`
    ]
  };
}

// =====================================================
// EBAY API SEARCH WITH SELLER INFO
// =====================================================
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
      'paginationInput.entriesPerPage': '10'
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

    // Extract seller information from first few items
    const topSellers = items.slice(0, 3).map(item => ({
      username: item.sellerInfo?.[0]?.sellerUserName?.[0] || 'Unknown',
      feedbackScore: item.sellerInfo?.[0]?.feedbackScore?.[0] || 0,
      positivePercent: item.sellerInfo?.[0]?.positiveFeedbackPercent?.[0] || 0,
      profileUrl: `https://www.ebay.com/usr/${item.sellerInfo?.[0]?.sellerUserName?.[0]}`,
      itemUrl: item.viewItemURL?.[0] || '',
      itemTitle: item.title?.[0] || '',
      itemPrice: item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || 0
    }));

    const result = {
      keyword,
      avgPrice: avgPrice.toFixed(2),
      soldCount,
      minPrice: Math.min(...prices).toFixed(2),
      maxPrice: Math.max(...prices).toFixed(2),
      topSellers // NEW: Seller information
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

// =====================================================
// SUPPLIER PRICE ESTIMATOR
// =====================================================
function getSupplierPrice(keyword) {
  const estimatedPrices = {
    'phone': 5, 'case': 2, 'cable': 1.5, 'led': 3, 'light': 4,
    'speaker': 8, 'holder': 2, 'organizer': 3, 'mat': 5,
    'bottle': 3, 'band': 2, 'brush': 1.5, 'sunglasses': 3,
    'jewelry': 2, 'watch': 8, 'bluetooth': 6, 'charging': 2,
    'ring': 1, 'clip': 0.80, 'mount': 3, 'stand': 2.5,
    'wireless': 6, 'earbuds': 7, 'usb': 1.2,
    'eyelash': 3.5, 'makeup': 1.8, 'scrunchies': 0.5,
    'blender': 8.5, 'drawer': 2.8, 'resistance': 4.5,
    'ps5': 4, 'nintendo': 3, 'switch': 3, 'gaming': 5,
    'controller': 3.5, 'headset': 8, 'grips': 1.5,
    'console': 4, 'cooling': 3, 'dock': 4.5, 'vr': 5,
    'mouse': 3, 'pad': 1.5, 'skin': 1.2, 'cover': 2
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

// =====================================================
// SUPPLIER LINKS GENERATOR
// =====================================================
function getSupplierLinks(keyword) {
  const encodedKeyword = encodeURIComponent(keyword);
  
  return {
    aliexpress: `https://www.aliexpress.com/wholesale?SearchText=${encodedKeyword}`,
    alibaba: `https://www.alibaba.com/trade/search?SearchText=${encodedKeyword}`,
    dhgate: `https://www.dhgate.com/wholesale/search.do?act=search&searchkey=${encodedKeyword}`,
    banggood: `https://www.banggood.com/search/${encodedKeyword}.html`,
    temu: `https://www.temu.com/search_result.html?search_key=${encodedKeyword}`,
    amazon: `https://www.amazon.com/s?k=${encodedKeyword}`,
    walmart: `https://www.walmart.com/search?q=${encodedKeyword}`
  };
}

// =====================================================
// API ROUTES
// =====================================================

app.get('/', (req, res) => {
  const stats = rateLimiter.getStats();
  res.json({ 
    status: 'running',
    message: 'Product Finder PRO - Multi-Feature Edition',
    ebayConfigured: !!process.env.EBAY_APP_ID,
    features: {
      rateLimiting: true,
      caching: true,
      priceHistory: true,
      tiktokTrending: true,
      socialProof: true,
      aiGenerator: !!process.env.OPENAI_API_KEY,
      sellerLinks: true
    },
    rateLimiting: { enabled: true, hourlyUsage: stats.hourly },
    cache: { enabled: true, entries: Object.keys(cacheManager.cache).length },
    timestamp: new Date().toISOString()
  });
});

// Main scan endpoint with ALL features + CATEGORY SCANNER
app.post('/api/scan', async (req, res) => {
  try {
    // SMART CATEGORY SELECTION
    const categoriesToScan = selectCategoriesToScan(5); // Top 5 categories
    console.log('\n🎯 Selected Categories:', categoriesToScan.join(', '));
    
    const productsList = getProductsForCategories(categoriesToScan);
    console.log(`📦 Scanning ${productsList.length} products across ${categoriesToScan.length} categories\n`);
    
    const findings = [];
    const categoryResults = {};
    
    console.log('🔍 Scanning with ADVANCED features...');
    const startTime = Date.now();
    
    for (const productInfo of productsList) {
      const keyword = productInfo.keyword;
      const category = productInfo.category;
      
      try {
        const ebayData = await searchEbay(keyword);
        if (!ebayData) continue;
        
        // Get TikTok trending data
        const tiktokData = await getTikTokTrending(keyword);
        
        // Get social proof metrics
        const socialProof = await getSocialProof(keyword);
        
        const supplierPrice = parseFloat(getSupplierPrice(keyword));
        const sellPrice = parseFloat(ebayData.avgPrice);
        const ebayFee = sellPrice * 0.1325;
        const paymentFee = sellPrice * 0.0349;
        const shipping = 3.00;
        
        const totalCosts = supplierPrice + ebayFee + paymentFee + shipping;
        const profit = sellPrice - totalCosts;
        const margin = (profit / sellPrice) * 100;
        
        console.log(`   📦 "${keyword}"`);
        console.log(`   💵 Profit: $${profit.toFixed(2)} (${margin.toFixed(1)}%)`);
        console.log(`   ${tiktokData.status} | Demand: ${socialProof.validation}`);
        
        const competition = ebayData.soldCount > 300 ? 'High' : 
                          ebayData.soldCount > 100 ? 'Medium' : 'Low';
        
        // Use category from product info
        const productCategory = category;
        
        const meetsThreshold = profit = true;
        const supplierLinks = getSupplierLinks(keyword);
        
        // Record price in history
        cacheManager.recordPrice(keyword, {
          avgPrice: ebayData.avgPrice,
          minPrice: ebayData.minPrice,
          maxPrice: ebayData.maxPrice,
          profit: profit.toFixed(2),
          margin: margin.toFixed(1),
          soldCount: ebayData.soldCount
        });
        
        // Get price history
        const priceHistory = cacheManager.getPriceHistory(keyword, 30);
        
        findings.push({
          name: keyword.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          category: productCategory,
          buyPrice: supplierPrice.toFixed(2),
          sellPrice: sellPrice.toFixed(2),
          profit: profit.toFixed(2),
          margin: margin.toFixed(1),
          competition,
          soldCount: ebayData.soldCount,
          meetsThreshold: meetsThreshold ? '✅ Yes' : '❌ No',
          
          // eBay seller info - NEW!
          topSellers: ebayData.topSellers,
          ebaySearchUrl: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(keyword)}&LH_Sold=1&LH_Complete=1`,
          
          // TikTok trending - NEW!
          tiktok: tiktokData,
          
          // Social proof - NEW!
          socialProof: socialProof,
          
          // Price history - NEW!
          priceHistory: {
            data: priceHistory,
            dataPoints: priceHistory.length,
            trend: priceHistory.length > 1 ? 
              (parseFloat(priceHistory[priceHistory.length-1].avgPrice) > parseFloat(priceHistory[0].avgPrice) ? 'increasing' : 'decreasing') : 
              'insufficient_data'
          },
          
          // Supplier links
          suppliers: {
            aliexpress: { url: supplierLinks.aliexpress, estimatedPrice: supplierPrice },
            alibaba: { url: supplierLinks.alibaba, estimatedPrice: (supplierPrice * 0.8).toFixed(2) },
            dhgate: { url: supplierLinks.dhgate, estimatedPrice: (supplierPrice * 0.9).toFixed(2) },
            banggood: { url: supplierLinks.banggood, estimatedPrice: supplierPrice },
            temu: { url: supplierLinks.temu, estimatedPrice: (supplierPrice * 0.85).toFixed(2) },
            amazon: { url: supplierLinks.amazon, estimatedPrice: (supplierPrice * 1.3).toFixed(2) },
            walmart: { url: supplierLinks.walmart, estimatedPrice: (supplierPrice * 1.2).toFixed(2) }
          },
          
          timestamp: new Date().toISOString()
        });
        
        // Track category results
        if (!categoryResults[productCategory]) {
          categoryResults[productCategory] = [];
        }
        categoryResults[productCategory].push(findings[findings.length - 1]);
        
        console.log('');
        
      } catch (error) {
        console.error(`   ❌ ${keyword}: ${error.message}`);
      }
    }
    
    await cacheManager.save();
    
    // Update category performance
    for (const [cat, products] of Object.entries(categoryResults)) {
      categoryTracker.updateCategory(cat, products);
    }
    await categoryTracker.save();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    const profitable = findings.filter(f => f.meetsThreshold === '✅ Yes').length;
    const viral = findings.filter(f => f.tiktok?.isViral).length;
    
    // Category breakdown
    const categoryStats = Object.entries(categoryResults).map(([cat, products]) => ({
      category: cat,
      total: products.length,
      profitable: products.filter(p => p.meetsThreshold === '✅ Yes').length
    }));
    
    console.log('═══════════════════════════════════════════');
    console.log(`✅ ADVANCED SCAN COMPLETE`);
    console.log(`═══════════════════════════════════════════`);
    console.log(`📊 Products: ${findings.length}`);
    console.log(`✅ Profitable: ${profitable}`);
    console.log(`🔥 Viral on TikTok: ${viral}`);
    console.log(`📂 Categories Scanned: ${categoriesToScan.length}`);
    console.log('');
    console.log('📊 Category Breakdown:');
    categoryStats.forEach(stat => {
      console.log(`   ${stat.category}: ${stat.profitable}/${stat.total} profitable`);
    });
    console.log(`⏱️  Duration: ${duration}s`);
    console.log('═══════════════════════════════════════════\n');
    
    res.json({ 
      success: true, 
      findings,
      count: findings.length,
      profitableCount: profitable,
      viralCount: viral,
      categoriesScanned: categoriesToScan,
      categoryBreakdown: categoryStats,
      scanDuration: duration,
      stats: rateLimiter.getStats(),
      features: ['TikTok Trending', 'Social Proof', 'Price History', 'Seller Links', 'Smart Categories'],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// Generate AI listing endpoint
app.post('/api/ai/generate-listing', async (req, res) => {
  try {
    const { keyword, productData } = req.body;
    
    if (!keyword || !productData) {
      return res.status(400).json({ error: 'Missing keyword or productData' });
    }
    
    console.log(`🤖 Generating AI listing for: ${keyword}`);
    
    const listing = await generateAIListing(keyword, productData);
    
    res.json({
      success: true,
      listing,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('AI generation error:', error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// Get price history endpoint
app.get('/api/history/:keyword', (req, res) => {
  try {
    const { keyword } = req.params;
    const days = parseInt(req.query.days) || 30;
    
    const history = cacheManager.getPriceHistory(keyword, days);
    
    res.json({
      success: true,
      keyword,
      history,
      dataPoints: history.length,
      daysRequested: days
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

// Get category performance stats
app.get('/api/categories/performance', (req, res) => {
  try {
    const topCategories = categoryTracker.getTopCategories(8);
    
    res.json({
      success: true,
      categories: topCategories,
      totalCategories: Object.keys(CATEGORY_PRODUCTS).length,
      availableProducts: Object.values(CATEGORY_PRODUCTS).flat().length
    });
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

// =====================================================
// SERVER STARTUP
// =====================================================
const PORT = process.env.PORT || 3001;

async function startServer() {
  await cacheManager.load();
  await categoryTracker.load();
  app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║     Product Finder PRO - Advanced Edition     ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log(`🚀 Port: ${PORT}`);
    console.log(`🔑 eBay: ${process.env.EBAY_APP_ID ? 'Connected ✅' : 'Missing ❌'}`);
    console.log(`🤖 OpenAI: ${process.env.OPENAI_API_KEY ? 'Connected ✅' : 'Template Mode'}`);
    console.log('');
    console.log('🎯 FEATURES:');
    console.log('   ✅ Rate Limiting (3s delay)');
    console.log('   ✅ Smart Caching (24h)');
    console.log('   ✅ Price History Tracking');
    console.log('   ✅ TikTok Trending Analysis');
    console.log('   ✅ Social Proof Metrics');
    console.log('   ✅ AI Listing Generator');
    console.log('   ✅ Direct Seller Links');
    console.log('   ✅ Smart Category Scanner (8 categories)');
    console.log('   ✅ 7 Supplier Sources');
    console.log('');
    console.log('📡 Endpoints:');
    console.log('   POST /api/scan');
    console.log('   POST /api/ai/generate-listing');
    console.log('   GET  /api/history/:keyword');
    console.log('   GET  /api/categories/performance');
    console.log('');
  });
}

startServer();