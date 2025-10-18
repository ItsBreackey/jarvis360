const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy API requests to Django backend running on 127.0.0.1:8000 during local development.
  // This keeps the browser origin the same (http://localhost:3000) so HttpOnly cookies set by the
  // backend will be accepted by the browser.
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
      secure: false,
      logLevel: 'debug',
      // Rewrite cookie domains set by the backend to match the browser origin (localhost)
      cookieDomainRewrite: {
        '127.0.0.1': 'localhost',
        '127.0.0.1:8000': 'localhost'
      },
      // Keep cookie path as-is, but rewrite if backend sets unexpected path
      cookiePathRewrite: {
        '/': '/'
      },
      onProxyRes: (proxyRes, req, res) => {
        // helpful debug during local development to see Set-Cookie headers
        const sc = proxyRes.headers['set-cookie'];
        if (sc) {
          // eslint-disable-next-line no-console
          console.debug('proxy forwarding Set-Cookie headers:', sc);
        }
      },
    })
  );
};
