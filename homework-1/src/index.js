const express = require("express");
const transactionRoutes = require("./routes/transactions");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(transactionRoutes);

app.listen(PORT, () => {
  console.log(`Banking API running on http://localhost:${PORT}`);
});
