import Stripe from "stripe";

// Workers runtime has no Node net sockets — Stripe's SDK needs the fetch-based
// HTTP client instead of its Node default.
export function getStripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}
