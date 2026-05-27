const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Your credentials (hardcoded for now, but you can move to env later)
const CONSUMER_KEY = "TDpigB00hs+zA18cwH2F182jJGyd8xev";
const CONSUMER_SECRET = "1KpqkfsMaihIc0lhnBo/gBZ5smw=";
const IS_SANDBOX = true;
const BASE_URL = "https://cybqa.pesapal.com/pesapalv3";
const CALLBACK_URL = "https://webhook.site"; // temporary

// We'll store IPN ID once registered
let ipnId = null;

// Helper: get access token
async function getAccessToken() {
    const response = await axios.post(`${BASE_URL}/api/Auth/RequestToken`, {
        consumer_key: CONSUMER_KEY,
        consumer_secret: CONSUMER_SECRET
    }, { headers: { 'Content-Type': 'application/json' } });
    return response.data.token;
}

// Helper: register IPN (runs once)
async function registerIPN() {
    if (ipnId) return ipnId;
    const token = await getAccessToken();
    const ipnUrl = "https://pesapal-backend-73lm.onrender.com/api/pesapal/ipn";
    const response = await axios.post(`${BASE_URL}/api/URLSetup/RegisterIPN`, {
        url: ipnUrl,
        ipn_notification_type: "POST"
    }, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
    ipnId = response.data.ipn_id;
    console.log("✅ IPN registered with ID:", ipnId);
    return ipnId;
}

// IPN endpoint (where Pesapal sends payment confirmation)
app.post('/api/pesapal/ipn', async (req, res) => {
    console.log("IPN received:", req.query);
    // You can update subscription status here
    res.status(200).json({ status: "200", message: "IPN received" });
});

// Payment initiation
app.post('/api/pesapal/initiate', async (req, res) => {
    try {
        const { amount, currency, email, reference } = req.body;
        if (!amount || !currency || !email) {
            return res.status(400).json({ error: "Missing fields" });
        }

        // Ensure IPN is registered (first time only)
        const notification_id = await registerIPN();

        const token = await getAccessToken();
        const orderData = {
            id: reference || `SUB_${Date.now()}`,
            currency,
            amount: Number(amount),
            description: "APSHULE Subscription",
            callback_url: CALLBACK_URL,
            notification_id: notification_id, // ✅ now using real IPN ID
            billing_address: {
                email_address: email,
                phone_number: "N/A",
                country_code: "UG",
                first_name: "User",
                last_name: "",
                line1: "Kampala"
            }
        };

        const response = await axios.post(`${BASE_URL}/api/Transactions/SubmitOrderRequest`, orderData, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });

        res.json({
            redirect_url: response.data.redirect_url,
            order_tracking_id: response.data.order_tracking_id,
            merchant_reference: orderData.id
        });
    } catch (err) {
        console.error("Initiate error:", err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data?.message || "Payment initiation failed" });
    }
});

app.get('/', (req, res) => res.send('Pesapal backend running ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
