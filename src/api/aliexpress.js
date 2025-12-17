const axios = require('axios');

async function getSupplierPrice(keyword) {
  try {
    const estimatedPrices = {
      'phone': 5,
      'case': 2,
      'cable': 1.5,
      'led': 3,
      'light': 4,
      'speaker': 8,
      'holder': 2,
      'organizer': 3,
      'mat': 5,
      'bottle': 3,
      'band': 2,
      'brush': 1.5,
      'sunglasses': 3,
      'jewelry': 2,
      'watch': 8
    };

    const lowerKeyword = keyword.toLowerCase();
    for (const [key, price] of Object.entries(estimatedPrices)) {
      if (lowerKeyword.includes(key)) {
        const variance = (Math.random() - 0.5) * 0.6;
        return (price * (1 + variance)).toFixed(2);
      }
    }

    return '5.00';

  } catch (error) {
    console.error('Error getting supplier price:', error.message);
    return '5.00';
  }
}

module.exports = {
  getSupplierPrice
};