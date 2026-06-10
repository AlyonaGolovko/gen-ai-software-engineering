const express = require("express");
const rateLimit = require("express-rate-limit");
const transactionRoutes = require("./routes/transactions");

const app = express();
const PORT = 3000;

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later" },
});

app.use(limiter);
app.use(express.json());
app.use(transactionRoutes);

app.listen(PORT, () => {
  console.log(`Banking API running on http://localhost:${PORT}`);
});
