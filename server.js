// Minimal server for the demo shop. Serves the static page and the product data.
// Deliberately tiny: the point of this repo is the agent loop, not the app.
const express = require('express');
const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(path.join(__dirname, 'data')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`demo shop on http://localhost:${PORT}`));
