require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  upstream: process.env.UPSTREAM_URL || 'http://example.com/live',
  basePath: process.env.BASE_PATH || '/foo_bar',
  useMorgan: Boolean(process.env.USE_MORGAN) || false,
}