const crypto = require('crypto');

const META_API_URL = `https://graph.facebook.com/${process.env.META_API_VERSION}/${process.env.META_PIXEL_ID}/events`;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

function sha256Phone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return crypto.createHash('sha256').update(digits).digest('hex');
}

function buildUserData(customer) {
  const address = customer.billing_address || {};
  const nameParts = (customer.name || '').trim().split(/\s+/);

  return {
    ...(customer.email && { em: sha256(customer.email) }),
    ...(customer.phone && { ph: sha256Phone(customer.phone) }),
    ...(nameParts[0] && { fn: sha256(nameParts[0]) }),
    ...(nameParts.length > 1 && { ln: sha256(nameParts[nameParts.length - 1]) }),
    ...(address.zipcode && { zp: sha256(address.zipcode.replace(/\D/g, '')) }),
    ...(address.city && { ct: sha256(address.city) }),
    ...(address.estate && { st: sha256(address.estate.toLowerCase()) }),
    ...(address.country && { country: sha256(address.country.toLowerCase()) }),
  };
}

async function sendToMeta(eventName, eventId, userData, customData) {
  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      user_data: userData,
      custom_data: customData,
    }],
    ...(process.env.META_TEST_EVENT_CODE && { test_event_code: process.env.META_TEST_EVENT_CODE }),
  };

  const res = await fetch(`${META_API_URL}?access_token=${process.env.META_ACCESS_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return res.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const payload = req.body || {};

  // Ignorar eventos de teste
  if (payload.test === true) {
    return res.status(200).json({ ok: true, skipped: 'test event' });
  }

  const customer = payload.customer || {};
  const transaction = payload.transaction || {};
  const product = payload.product || {};
  const linkQueryParams = payload.link?.query_params || {};
  const userData = buildUserData(customer);

  // IP do comprador vem direto no customer.ip da Payt
  if (customer.ip) userData.client_ip_address = customer.ip;

  // fbc derivado do fbclid que a Payt captura em link.query_params
  if (linkQueryParams.fbclid) {
    userData.fbc = `fb.1.${Date.now()}.${linkQueryParams.fbclid}`;
  }

  if (customer.email) userData.external_id = sha256(customer.email);

  try {
    if (payload.status === 'paid') {
      const value = transaction.total_price ? transaction.total_price / 100 : 0;

      await sendToMeta('Purchase', payload.transaction_id, userData, {
        currency: 'BRL',
        value,
        content_ids: [product.code || process.env.PRODUCT_ID],
        content_name: product.name || process.env.PRODUCT_NAME,
        content_type: 'product',
        order_id: payload.transaction_id,
      });

    } else if (payload.status === 'lost_cart' || payload.status === 'waiting_payment') {
      const abandonedValue = product.price ? product.price / 100 : 0;
      await sendToMeta(
        'InitiateCheckout',
        payload.cart_id || payload.transaction_id,
        userData,
        {
          currency: 'BRL',
          value: abandonedValue,
          content_ids: [product.code || process.env.PRODUCT_ID],
          content_name: product.name || process.env.PRODUCT_NAME,
          content_type: 'product',
        }
      );
    }
  } catch (err) {
    console.error('[webhook] CAPI error:', err.message);
  }

  return res.status(200).json({ ok: true });
};
