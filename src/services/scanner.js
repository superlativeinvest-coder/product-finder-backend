const { searchEbay, calculateCompetition } = require('../api/ebay');
const { getSupplierPrice } = require('../api/aliexpress');
const { sendProductAlert } = require('../api/emails');

const SEARCH_KEYWORDS = {
  'Electronics': [
    'phone case', 'phone holder', 'led strip lights', 'bluetooth speaker',
    'charging cable', 'headphone', 'earbuds', 'phone stand', 'cable organizer'
  ],
  'Home & Garden': [
    'kitchen gadgets', 'storage organizer', 'closet organizer', 'drawer organizer',
    'plant pot', 'cleaning brush', 'food storage', 'spice rack'
  ],
  'Fashion': [
    'sunglasses', 'jewelry set', 'watch band', 'scarf', 'wallet',
    'handbag', 'belt', 'hat', 'bracelet'
  ],
  'Sports': [
    'yoga mat', 'resistance bands', 'water bottle', 'gym gloves',
    'jump rope', 'exercise ball', 'foam roller', 'fitness tracker band'
  ],
  'Beauty': [
    'makeup brush set', 'beauty sponge', 'nail art', 'hair clip',
    'facial roller', 'eyelash curler', 'makeup organizer', 'hair bands'
  ]
};

async function scanProducts(config) {
  const { minProfit, minMargin, categories } = config;
  const findings = [];
  
  console.log(`Starting scan with minProfit: $${minProfit}, minMargin: ${minMargin}%`);

  for (const category of categories) {
    const keywords = SEARCH_KEYWORDS[category] || [];
    console.log(`Scanning ${category} category (${keywords.length} keywords)...`);

    for (const keyword of keywords) {
      try {
        const ebayData = await searchEbay(keyword);
        
        if (!ebayData) {
          continue;
        }

        const supplierPrice = parseFloat(await getSupplierPrice(keyword));
        const sellPrice = parseFloat(ebayData.avgPrice);
        
        const ebayFee = sellPrice * 0.1325;
        const paymentFee = sellPrice * 0.0349;
        const shippingCost = 3.00;
        
        const totalCosts = supplierPrice + ebayFee + paymentFee + shippingCost;
        const profit = sellPrice - totalCosts;
        const margin = (profit / sellPrice) * 100;

        if (profit >= minProfit && margin >= minMargin) {
          const competition = calculateCompetition(ebayData.soldCount);
          
          const product = {
            name: keyword.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            category,
            buyPrice: supplierPrice.toFixed(2),
            sellPrice: sellPrice.toFixed(2),
            profit: profit.toFixed(2),
            margin: margin.toFixed(1),
            competition,
            soldCount: ebayData.soldCount,
            timestamp: new Date().toISOString()
          };

          findings.push(product);
          console.log(`✅ Found: ${product.name} | Profit: $${product.profit} | Margin: ${product.margin}%`);

          if (profit >= 20 && margin >= 40) {
            await sendProductAlert(product);
          }
        }

        await sleep(1000);

      } catch (error) {
        console.error(`Error scanning "${keyword}":`, error.message);
      }
    }
  }

  console.log(`Scan complete. Found ${findings.length} products.`);
  return findings;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  scanProducts
};