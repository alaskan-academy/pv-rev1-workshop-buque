const META_API_URL = `https://graph.facebook.com/${process.env.META_API_VERSION}/${process.env.META_PIXEL_ID}/events`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { eventName, eventId, fbp, fbc, pageUrl, value } = req.body || {};
  if (!eventName || !eventId) return res.status(400).json({ error: 'Missing required fields' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  const userData = {
    client_ip_address: ip,
    client_user_agent: userAgent,
    ...(fbp && { fbp }),
    ...(fbc && { fbc }),
  };

  const customData = {
    currency: 'BRL',
    value: parseFloat(value || 0),
    content_ids: [process.env.PRODUCT_ID],
    content_name: process.env.PRODUCT_NAME,
    content_type: 'product',
  };

  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: pageUrl || '',
      action_source: 'website',
      user_data: userData,
      custom_data: customData,
    }],
    ...(process.env.META_TEST_EVENT_CODE && { test_event_code: process.env.META_TEST_EVENT_CODE }),
  };

  try {
    await fetch(`${META_API_URL}?access_token=${process.env.META_ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[track] CAPI error:', err.message);
  }

  return res.status(200).json({ ok: true });
};
