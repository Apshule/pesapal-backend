const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const CONSUMER_KEY = "7mosYMwsJ5Sla3A7DlyA2vFO+L6Ke1xq";
const CONSUMER_SECRET = "GFo48ikRkNEYI90phe1xuk7TpWM=";
const IS_SANDBOX = true;
const BASE_URL = IS_SANDBOX ? "https://cybqa.pesapal.com/pesapalv3" : "https://pay.pesapal.com/v3";
const CALLBACK_URL = "https://appshule.com/";

let accessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
    if (accessToken && Date.now() < tokenExpiry) return accessToken;
    const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
    const response = await axios.post(`${BASE_URL}/api/Auth/RequestToken`, {}, {
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
    });
    accessToken = response.data.token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
    return accessToken;
}

app.post('/api/pesapal/initiate', async (req, res) => {
    try {
        const { amount, currency, description, email, phone, name, reference } = req.body;
        if (!amount || !currency || !email) return res.status(400).json({ error: "Missing fields" });
        const token = await getAccessToken();
        const orderData = {
            id: reference, currency, amount, description, callback_url: CALLBACK_URL, notification_id: null,
            billing_address: { email_address: email, phone_number: phone || "N/A", country_code: "UG",
                first_name: (name && name.split(' ')[0]) || "User", middle_name: "", last_name: (name && name.split(' ')[1]) || "",
                line1: "Kampala", city: "Kampala", state: "Kampala", postal_code: "256", zip_code: "256" }
        };
        const response = await axios.post(`${BASE_URL}/api/Transactions/SubmitOrderRequest`, orderData, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        res.json({ redirect_url: response.data.redirect_url, order_tracking_id: response.data.order_tracking_id, merchant_reference: reference });
    } catch (err) {
        res.status(500).json({ error: "Payment initiation failed" });
    }
});

app.post('/api/pesapal/status', async (req, res) => {
    try {
        const { order_tracking_id } = req.body;
        const token = await getAccessToken();
        const response = await axios.get(`${BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${order_tracking_id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        res.json({ status: response.data.payment_status_description });
    } catch (err) {
        res.status(500).json({ error: "Failed to get payment status" });
    }
});

app.get('/', (req, res) => res.send('Pesapal backend is running ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
