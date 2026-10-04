// Local stand-in for Paymob KSA used by the live payments e2e — never talks
// to the real gateway and never moves money.
//
//   node e2e/support/fake-paymob.mjs 4599
//
// Endpoints the backend calls (PAYMOB_BASE_URL=http://127.0.0.1:4599):
//   POST /api/auth/tokens                          → { token }
//   POST /v1/intention/                            → { id, intention_order_id, client_secret }
//   POST /api/ecommerce/orders/transaction_inquiry → transaction set via control API, else 404
//   GET  /api/acceptance/transactions/:id          → transaction set via control API, else 404
// Control API for the test:
//   POST /_control/inquiry { order_id, tx }   POST /_control/tx { tx }   GET /_control/intentions
import http from 'node:http'

const port = Number(process.argv[2] || 4599)
let orderSeq = 800000 + Math.floor(Math.random() * 100000)
const inquiry = new Map()
const byId = new Map()
const intentions = []

http
  .createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {}
      const send = (status, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(payload))
      }
      if (req.url === '/api/auth/tokens') return send(201, { token: 'fake-token' })
      if (req.url === '/v1/intention/') {
        orderSeq++
        intentions.push({ order_id: orderSeq, body })
        return send(201, { id: `pi_test_${orderSeq}`, intention_order_id: orderSeq, client_secret: `csk_test_${orderSeq}` })
      }
      if (req.url === '/api/ecommerce/orders/transaction_inquiry') {
        const tx = inquiry.get(String(body.order_id))
        return tx ? send(200, tx) : send(404, { detail: 'Not found.' })
      }
      const txMatch = /^\/api\/acceptance\/transactions\/(\d+)$/.exec(req.url || '')
      if (txMatch && req.method === 'GET') {
        const tx = byId.get(txMatch[1])
        return tx ? send(200, tx) : send(404, { detail: 'Not found.' })
      }
      if (req.url === '/_control/tx') {
        byId.set(String(body.tx.id), body.tx)
        return send(200, { ok: true })
      }
      if (req.url === '/_control/inquiry') {
        inquiry.set(String(body.order_id), body.tx)
        return send(200, { ok: true })
      }
      if (req.url === '/_control/intentions') return send(200, intentions)
      send(404, {})
    })
  })
  .listen(port, '127.0.0.1', () => console.log(`[fake-paymob] listening on ${port}`))
