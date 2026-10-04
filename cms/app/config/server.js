module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  // Public URL (set from CMS_DOMAIN in docker-compose.yml); empty in local dev.
  url: env('URL', ''),
  // Behind Caddy: trust X-Forwarded-Proto so Strapi sees https and sets its secure admin cookies.
  proxy: { koa: env.bool('PROXY', true) },
  app: {
    keys: env.array('APP_KEYS'),
  },
  webhooks: {
    populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
  },
});
