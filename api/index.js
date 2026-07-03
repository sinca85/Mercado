// Vercel usa src/server.js para local/start. Para Vercel serverless puro,
// conviene migrar cada endpoint a /api/*.js o usar un adaptador.
// Esta base está pensada para deploy Node simple o Vercel con serverless refactor mínimo.
export default function handler(_req, res) {
  res.status(200).json({ ok: true, note: 'Usá npm run dev localmente. Para Vercel, ver README.' });
}
