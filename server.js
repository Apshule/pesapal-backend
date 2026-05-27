const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Optional env vars – warn but don't crash
const CONSUMER_KEY = process.env.PESAPAL_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET;
const IS_SANDBOX = process.env.PESAPAL_MODE !== 'production'; // default sandbox
const BASE_URL = IS_SANDBOX ? "https://cybqa.pesapal.com/pesapalv3" : "https://pay.pesapal.com/v3";
const CALLBACK_URL = process.env.PESAPAL_CALLBACK_URL || "https://appshule.com/payment-success";
const IPN_URL = process.env.IPN_URL || "https://pesapal-backend-73lm.onrender.com/api/pesapal/ipn";

if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    console.warn("⚠️ WARNING: PESAPAL_CONSUMER_KEY or SECRET not set. API calls will fail.");
    // Do NOT exit – allow server to start so you can see the error in logs
}

console.log(`Mode: ${IS_SANDBOX ? 'SANDBOX' : 'PRODUCTION'}`);
console.log(`IPN URL: ${IPN_URL}`);

let cachedIpnId = null;

async function getAccessToken() {
    if (!CONSUMER_KEY || !CONSUMER_SECRET) throw new Error("Missing credentials");
    const res = await axios.post(`${BASE_URL}/api/Auth/RequestToken`, {
        consumer_key: CONSUMER_KEY,
        consumer_secret: CONSUMER_SECRET
    });
    return res.data.token;
}

async function registerIPN() {
    if (cachedIpnId) return cachedIpnId;
    const token = await getAccessToken();
    const res = await axios.post(`${BASE_URL}/api/URLSetup/RegisterIPN`, {
        url: IPN_URL,
        ipn_notification_type: "POST"
    }, { headers: { Authorization: `Bearer ${token}` } });
    cachedIpnId = res.data.ipn_id;
    console.log("✅ IPN registered:", cachedIpnId);
    return cachedIpnId;
}

app.post('/api/pesapal/initiate', async (req, res) => {
    try {
        const { amount, currency, email } = req.body;
        if (!amount || !currency || !email) return res.status(400).json({ error: "Missing fields" });
        const ipnId = await registerIPN();
        const token = await getAccessToken();
        const order = {
            id: `ORDER_${Date.now()}`,
            currency: currency.toUpperCase(),
            amount: Number(amount),
            description: "APSHULE Subscription",
            callback_url: CALLBACK_URL,
            notification_id: ipnId,
            billing_address: { email_address: email, country_code: "UG" }
        };
        const submit = await axios.post(`${BASE_URL}/api/Transactions/SubmitOrderRequest`, order, {
            headers: { Authorization: `Bearer ${token}` }
        });
        res.json({ redirect_url: submit.data.redirect_url });
    } catch (err) {
        console.error("Initiate error:", err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data?.message || "Payment initiation failed" });
    }
});

app.post('/api/pesapal/ipn', (req, res) => {
    console.log("IPN hit", req.query, req.body);
    res.sendStatus(200);
});

app.get('/debug/ipn', async (req, res) => {
    try {
        const id = await registerIPN();
        res.json({ success: true, ipn_id: id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/', (req, res) => res.send('Pesapal backend running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
