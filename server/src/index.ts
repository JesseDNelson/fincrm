import { app } from "./app.js";

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`FinCRM API running on http://localhost:${PORT}`);
});
