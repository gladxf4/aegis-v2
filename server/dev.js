"use strict";

const { createApp } = require("./app");
const { config } = require("../lib/config");
const { getStore } = require("../lib/store");

const port = Number(process.env.PORT || 3000);
const app = createApp();

app.listen(port, () => {
  const store = getStore();
  console.log(`AegisID listening on http://localhost:${port}`);
  console.log(`app: ${config.appName} (${config.appId})`);
  console.log(`store: ${store.backend}`);
  if (!config.ready) {
    console.warn("verifier is not ready: set CHALLENGE_SECRET and run npm run issuer:init");
  }
});
