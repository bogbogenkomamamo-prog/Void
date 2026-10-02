const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// Simple Status Endpoint
app.get("/", (req, res) => {
    res.send("🥷 VOIDLESS4LGNG ENGINE IS ALIVE & ACTIVE 🩸");
});

function keepAlive() {
    app.listen(PORT, () => {
        console.log(`[ KEEPALIVE ] Web server running on port ${PORT}`);
    });

    // Self-ping every 5 minutes para iwas sleep
    setInterval(() => {
        const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
        fetch(url)
            .then(() => console.log("[ KEEPALIVE ] Self-ping successful."))
            .catch((err) => console.error("[ KEEPALIVE ] Self-ping failed:", err.message));
    }, 5 * 60 * 1000);
}

module.exports = keepAlive;
