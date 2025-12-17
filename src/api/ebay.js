const axios = require('axios');

const EBAY_FINDING_API = 'https://svcs.ebay.com/services/search/FindingService/v1';

async function searchEbay(keyword) {
  try {
    const params = {
      'OPERATION-NAME': 'findCompletedItems',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': process.env.EBAY_APP_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'REST-PAYLOAD': '',
      'keywords': keyword,
      'itemFilter(0).name': 'SoldItemsOnly',
      'itemFilter(0).value': 'true',
      'itemFilter(1).name': 'ListingType',
      'itemFilter(1).value': 'FixedPrice',
      'sortOrder': 'EndTimeSoonest',
      'paginationInput.entriesPerPage': '100'
    };

    const queryString = new URLSearchParams(params).toString();
    const response = await axios.get(`${EBAY_FINDING_API}?${queryString}`);

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
    console.error(`Error searching eBay for "${keyword}":`, error.message);
    return null;
  }
}

function calculateCompetition(soldCount) {
  if (soldCount > 300) return 'High';
  if (soldCount > 100) return 'Medium';
  return 'Low';
}

module.exports = {
  searchEbay,
  calculateCompetition
};