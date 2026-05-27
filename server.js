const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// --------------------------------------------------------------
// 1. CONFIGURATION – Uganda Sandbox (from official Pesapal docs)
// --------------------------------------------------------------
const CONSUMER_KEY = "TDpigB00hs+zA18cwH2F182jJGyd8xev";
const CONSUMER_SECRET = "1KpqkfsMaihIc0lhnBo/gBZ5smw=";
const BASE_URL = "https://cybqa.pesapal.com/pesapalv3";   // Sandbox
const CALLBACK_URL = "https://appshule.com/payment-success"; // Change to your real frontend success page
const IPN_URL = "https://pesapal-backend-73lm.onrender.com/api/pesapal/ipn"; // Your Render IPN endpoint

// Cache IPN ID after first registration
let cachedIpnId = null;

// --------------------------------------------------------------
// 2. HELPER: Get Access Token from Pesapal
// --------------------------------------------------------------
async function getAccessToken() {
    try {
        const response = await axios.post(`${BASE_URL}/api/Auth/RequestToken`, {
            consumer_key: CONSUMER_KEY,
            consumer_secret: CONSUMER_SECRET
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        const token = response.data.token;
        console.log("✅ Access token obtained");
        return token;
    } catch (error) {
        console.error("❌ Failed to get access token:", error.response?.data || error.message);
        throw new Error("Token fetch failed");
    }
}

// --------------------------------------------------------------
// 3. HELPER: Register IPN (runs once, stores ID)
// --------------------------------------------------------------
async function registerIPN() {
    if (cachedIpnId) {
        console.log("ℹ️ Using cached IPN ID:", cachedIpnId);
        return cachedIpnId;
    }

    try {
        const token = await getAccessToken();
        const response = await axios.post(`${BASE_URL}/api/URLSetup/RegisterIPN`, {
            url: IPN_URL,
            ipn_notification_type: "POST"
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        cachedIpnId = response.data.ipn_id;
        console.log("✅ IPN registered successfully. ID:", cachedIpnId);
        return cachedIpnId;
    } catch (error) {
        console.error("❌ IPN registration failed:", error.response?.data || error.message);
        throw new Error("IPN registration failed");
    }
}

// --------------------------------------------------------------
// 4. ENDPOINT: Initiate Payment (called by your frontend)
// --------------------------------------------------------------
app.post('/api/pesapal/initiate', async (req, res) => {
    try {
        const { amount, currency, email, reference } = req.body;

        // Validate required fields
        if (!amount || !currency || !email) {
            return res.status(400).json({ 
                error: "Missing required fields. Need amount, currency, email." 
            });
        }

        // Ensure IPN is registered (first call will register, subsequent calls use cache)
        const notification_id = await registerIPN();

        // Get a fresh token for this transaction
        const token = await getAccessToken();

        // Build order payload as per Pesapal API v3
        const orderData = {
            id: reference || `ORDER_${Date.now()}`,
            currency: currency.toUpperCase(),
            amount: Number(amount),
            description: "APSHULE Subscription",
            callback_url: CALLBACK_URL,
            notification_id: notification_id,
            billing_address: {
                email_address: email,
                phone_number: "0700000000",   // Dummy – change if you collect phone
                country_code: "UG",
                first_name: "Customer",
                last_name: "",
                line1: "Kampala"
            }
        };

        console.log("📤 Submitting order:", orderData);

        // Submit order to Pesapal
        const submitResponse = await axios.post(`${BASE_URL}/api/Transactions/SubmitOrderRequest`, orderData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log("✅ Order submitted. Redirect URL:", submitResponse.data.redirect_url);

        // Return the redirect URL to your frontend
        res.json({
            success: true,
            redirect_url: submitResponse.data.redirect_url,
            order_tracking_id: submitResponse.data.order_tracking_id,
            merchant_reference: orderData.id
        });

    } catch (error) {
        // Detailed error logging for debugging
        const pesapalError = error.response?.data;
        console.error("❌ Payment initiation failed:");
        console.error("Status:", error.response?.status);
        console.error("Error details:", pesapalError || error.message);

        // Send a clean error to the frontend
        res.status(500).json({
            error: "Payment initiation failed",
            details: pesapalError?.message || error.message
        });
    }
});

// --------------------------------------------------------------
// 5. ENDPOINT: IPN Callback (Pesapal sends payment status here)
// --------------------------------------------------------------
app.post('/api/pesapal/ipn', async (req, res) => {
    console.log("📨 IPN received at", new Date().toISOString());
    console.log("Query params:", req.query);
    console.log("Body:", req.body);

    // IMPORTANT: You must verify the payment status by calling Pesapal's
    // getTransactionStatus endpoint using the OrderTrackingId from req.query.
    // Then update your database (mark subscription as paid).
    // For now, we just acknowledge receipt.

    // Pesapal expects a 200 OK with a specific JSON response to stop retries
    res.status(200).json({ status: "200", message: "IPN processed successfully" });
});

// --------------------------------------------------------------
// 6. TEST ENDPOINT: Check IPN registration (handy for debugging)
// --------------------------------------------------------------
app.get('/debug/ipn', async (req, res) => {
    try {
        const ipnId = await registerIPN();
        res.json({ 
            success: true, 
            ipn_id: ipnId,
            message: "IPN is registered. You can now initiate payments."
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// --------------------------------------------------------------
// 7. HEALTH CHECK (for Render)
// --------------------------------------------------------------
app.get('/', (req, res) => {
    res.send('✅ Pesapal backend is running. Use /api/pesapal/initiate to start a payment.');
});

// --------------------------------------------------------------
// 8. START SERVER
// --------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 IPN URL will be: ${IPN_URL}`);
    console.log(`🔑 Using sandbox: ${BASE_URL}`);
});
