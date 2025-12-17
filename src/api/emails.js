const sgMail = require('@sendgrid/mail');

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

async function sendProductAlert(product) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('📧 Email alert (no SendGrid key):', product.name);
    return false;
  }

  try {
    const msg = {
      to: process.env.ALERT_EMAIL,
      from: process.env.FROM_EMAIL,
      subject: `🔥 Hot Product: ${product.name} - $${product.profit} profit`,
      html: `
        <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #7c3aed;">🚀 New Profitable Product Found!</h1>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2>${product.name}</h2>
            <p><strong>Category:</strong> ${product.category}</p>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0;">
            <div style="background: #dbeafe; padding: 15px; border-radius: 8px;">
              <p style="margin: 0; color: #666;">Buy Price</p>
              <h3 style="margin: 5px 0; color: #1e40af;">$${product.buyPrice}</h3>
            </div>
            
            <div style="background: #d1fae5; padding: 15px; border-radius: 8px;">
              <p style="margin: 0; color: #666;">Sell Price</p>
              <h3 style="margin: 5px 0; color: #065f46;">$${product.sellPrice}</h3>
            </div>
            
            <div style="background: #dcfce7; padding: 15px; border-radius: 8px;">
              <p style="margin: 0; color: #666;">Profit</p>
              <h3 style="margin: 5px 0; color: #15803d;">$${product.profit}</h3>
            </div>
            
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px;">
              <p style="margin: 0; color: #666;">Margin</p>
              <h3 style="margin: 5px 0; color: #a16207;">${product.margin}%</h3>
            </div>
          </div>
          
          <p><strong>Competition:</strong> ${product.competition}</p>
          <p><strong>Monthly Sales:</strong> ${product.soldCount} units</p>
          
          <a href="https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(product.name)}" 
             style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; 
                    border-radius: 6px; display: inline-block; margin-top: 20px;">
            View on eBay →
          </a>
        </div>
      `
    };

    await sgMail.send(msg);
    console.log(`✅ Email alert sent for: ${product.name}`);
    return true;

  } catch (error) {
    console.error('Email send error:', error.message);
    return false;
  }
}

module.exports = {
  sendProductAlert
};
```

5. **Press Ctrl+S** to save

---

**Almost done! Tell me when you've created these 4 files and I'll give you the last 2!** 🎯

Your structure should now look like:
```
product-finder-backend
├── src
│   ├── index.js ✅
│   └── api
│       ├── ebay.js ✅
│       ├── aliexpress.js ✅
│       └── emails.js ✅