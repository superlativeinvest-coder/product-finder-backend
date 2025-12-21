const fs = require('fs').promises;
const path = require('path');

// Top 8 Profitable Categories with Curated Products
const CATEGORY_PRODUCTS = {
  'Electronics & Accessories': [
    'phone ring holder',
    'usb c cable 3 pack',
    'wireless phone charger',
    'bluetooth earbuds',
    'phone camera lens kit'
  ],
  
  'Beauty & Personal Care': [
    'magnetic eyelashes',
    'makeup brush set',
    'hair scrunchies velvet',
    'jade roller face',
    'nail art kit'
  ],
  
  'Home & Garden': [
    'led strip lights',
    'drawer organizer',
    'plant grow light',
    'door draft stopper',
    'shower caddy corner'
  ],
  
  'Sports & Outdoors': [
    'resistance bands set',
    'yoga mat thick',
    'foam roller muscle',
    'jump rope weighted',
    'water bottle motivational'
  ],
  
  'Toys & Hobbies': [
    'fidget spinner metal',
    'slime kit diy',
    'puzzle 1000 piece',
    'play dough set',
    'building blocks educational'
  ],
  
  'Video Games & Consoles': [
    'ps5 controller skin',
    'nintendo switch case',
    'gaming mouse pad large',
    'controller grips',
    'headset stand rgb'
  ],
  
  'Fashion & Accessories': [
    'sunglasses polarized',
    'crossbody bag small',
    'baseball cap unisex',
    'face mask reusable',
    'watch band leather'
  ],
  
  'Pet Supplies': [
    'pet hair remover',
    'dog chew toys',
    'cat laser toy',
    'pet water fountain',
    'dog poop bags holder'
  ]
};

// Category Performance Tracking
class CategoryTracker {
  constructor() {
    this.performanceFile = path.join(__dirname, 'category_performance.json');
    this.performance = {};
  }

  async load() {
    try {
      const data = await fs.readFile(this.performanceFile, 'utf8');
      this.performance = JSON.parse(data);
      console.log(`📊 Loaded performance data for ${Object.keys(this.performance).length} categories`);
    } catch (error) {
      this.performance = {};
      // Initialize with default scores
      Object.keys(CATEGORY_PRODUCTS).forEach(category => {
        this.performance[category] = {
          totalScanned: 0,
          profitableFound: 0,
          avgProfit: 0,
          avgMargin: 0,
          successRate: 0,
          lastScanned: null,
          score: 50 // Default score
        };
      });
    }
  }

  async save() {
    try {
      await fs.writeFile(this.performanceFile, JSON.stringify(this.performance, null, 2));
    } catch (error) {
      console.error('Category performance save error:', error.message);
    }
  }

  updateCategory(category, products) {
    if (!this.performance[category]) {
      this.performance[category] = {
        totalScanned: 0,
        profitableFound: 0,
        avgProfit: 0,
        avgMargin: 0,
        successRate: 0,
        lastScanned: null,
        score: 50
      };
    }

    const profitable = products.filter(p => p.meetsThreshold === '✅ Yes');
    const totalProfit = products.reduce((sum, p) => sum + parseFloat(p.profit), 0);
    const totalMargin = products.reduce((sum, p) => sum + parseFloat(p.margin), 0);

    const stats = this.performance[category];
    stats.totalScanned += products.length;
    stats.profitableFound += profitable.length;
    stats.avgProfit = ((stats.avgProfit * (stats.totalScanned - products.length)) + totalProfit) / stats.totalScanned;
    stats.avgMargin = ((stats.avgMargin * (stats.totalScanned - products.length)) + totalMargin) / stats.totalScanned;
    stats.successRate = (stats.profitableFound / stats.totalScanned) * 100;
    stats.lastScanned = new Date().toISOString();
    
    // Calculate score (0-100) based on success rate and avg profit
    stats.score = Math.min(100, Math.floor(
      (stats.successRate * 0.6) + 
      (Math.min(stats.avgProfit, 10) / 10 * 40)
    ));
  }

  getTopCategories(count = 8) {
    // Sort categories by score
    return Object.entries(this.performance)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, count)
      .map(([category, stats]) => ({
        category,
        score: stats.score,
        successRate: stats.successRate.toFixed(1),
        avgProfit: stats.avgProfit.toFixed(2)
      }));
  }

  shouldScanCategory(category) {
    const stats = this.performance[category];
    if (!stats || !stats.lastScanned) return true;
    
    // Don't scan same category within 12 hours
    const lastScan = new Date(stats.lastScanned);
    const hoursSince = (Date.now() - lastScan.getTime()) / (1000 * 60 * 60);
    
    return hoursSince >= 12;
  }
}

const categoryTracker = new CategoryTracker();

// Smart Category Selection
function selectCategoriesToScan(maxCategories = 5) {
  const available = Object.keys(CATEGORY_PRODUCTS).filter(cat => 
    categoryTracker.shouldScanCategory(cat)
  );

  if (available.length === 0) {
    console.log('⚠️  All categories scanned recently. Using top performers anyway.');
    return categoryTracker.getTopCategories(maxCategories).map(c => c.category);
  }

  // Prioritize by score
  const sorted = available.map(cat => ({
    category: cat,
    score: categoryTracker.performance[cat]?.score || 50
  })).sort((a, b) => b.score - a.score);

  return sorted.slice(0, maxCategories).map(c => c.category);
}

// Get products for selected categories
function getProductsForCategories(categories) {
  const products = [];
  categories.forEach(category => {
    const categoryProducts = CATEGORY_PRODUCTS[category] || [];
    categoryProducts.forEach(keyword => {
      products.push({
        keyword,
        category
      });
    });
  });
  return products;
}

module.exports = {
  CATEGORY_PRODUCTS,
  CategoryTracker,
  categoryTracker,
  selectCategoriesToScan,
  getProductsForCategories
};