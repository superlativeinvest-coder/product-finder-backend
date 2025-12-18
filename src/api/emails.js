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
      html: `<div><h1>New Product: ${product.name}</h1><p>Profit: $${product.profit}</p></div>`
    };

    await sgMail.send(msg);
    console.log(`✅ Email sent: ${product.name}`);
    return true;
  } catch (error) {
    console.error('Email error:', error.message);
    return false;
  }
}

module.exports = {
  sendProductAlert
};