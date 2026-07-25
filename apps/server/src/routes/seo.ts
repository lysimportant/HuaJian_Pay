import type { FastifyInstance } from "fastify";

/**
 * Crawler policy for a payment platform:
 * - Do NOT publish a public sitemap of orders/admin.
 * - Disallow sensitive path prefixes; allow health/root only for ops probes.
 */
const ROBOTS_TXT = `# HuaJian_Pay — safe robots policy
# Orders, pay pages, admin APIs and channel callbacks must not be crawled.
User-agent: *
Disallow: /pay/
Disallow: /admin
Disallow: /admin/
Disallow: /api/
Disallow: /channels/
Disallow: /submit.php
Disallow: /mapi.php
Disallow: /api.php

# No public marketing sitemap in this product.
# Do not invent Sitemap: entries that list trade_no or merchant data.
`;

export async function seoRoutes(app: FastifyInstance): Promise<void> {
  app.get("/robots.txt", async (_req, reply) => {
    return reply
      .type("text/plain; charset=utf-8")
      .header("Cache-Control", "public, max-age=300")
      .header("X-Robots-Tag", "noindex")
      .send(ROBOTS_TXT);
  });
}
