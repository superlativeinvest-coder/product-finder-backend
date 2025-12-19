const { searchEbay, calculateCompetition } = require('../api/ebay');
const { getSupplierPrice } = require('../api/aliexpress');
const { sendProductAlert } = require('../api/emails');

const SEARCH_KEYWORDS = {
  'Electronics': ['phone case', 'led lights', 'bluetooth speaker'],
  'Home & Garden': ['kitchen organizer', 'storage box'],
  'Fashion': ['sunglasses', 'jewelry'],
  'Sports': ['yoga mat', 'water bottle'],
  'Beauty': ['makeup brush', 'beauty sponge']
};

async function scanProducts(config) {
  const { minProfit, minMargin, categories } = config;
  const findings = [];
  
  console.log(`Scanning with minProfit=$${minProfit}, minMargin=${minMargin}%`);

  for (const category of categories) {
    const keywords = SEARCH_KEYWORDS[category] || [];
    console.log(`Scanning ${category} (${keywords.length} keywords)...`);

    for (const keyword of keywords) {
      try {
        const ebayData = await searchEbay(keyword);
        if (!ebayData) continue;

        const supplierPrice = parseFloat(await getSupplierPrice(keyword));
        const sellPrice = parseFloat(ebayData.avgPrice);
        
        const fees = sellPrice * 0.1674;
        const shipping = 3.00;
        const totalCost = supplierPrice + fees + shipping;
        const profit = sellPrice - totalCost;
        const margin = (profit / sellPrice) * 100;

        if (profit >= minProfit && margin >= minMargin) {
          const product = {
            name: keyword.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            category,
            buyPrice: supplierPrice.toFixed(2),
            sellPrice: sellPrice.toFixed(2),
            profit: profit.toFixed(2),
            margin: margin.toFixed(1),
            competition: calculateCompetition(ebayData.soldCount),
            soldCount: ebayData.soldCount,
            timestamp: new Date().toISOString()
          };

          findings.push(product);
          console.log(`✅ Found: ${product.name} - Profit: $${product.profit}`);

          if (profit >= 20 && margin >= 40) {
            await sendProductAlert(product);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error scanning "${keyword}":`, error.message);
      }
    }
  }

  console.log(`Scan complete. Found ${findings.length} products.`);
  return findings;
}

module.exports = {
  scanProducts
};
```