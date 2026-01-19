import http from 'http';
import { Civitai } from 'civitai';

const port = process.env.PORT || 18888;
const apiKey = process.env.CIVITAI_API_KEY;

if (!apiKey) {
  console.error('CIVITAI_API_KEY is required');
  process.exit(1);
}

const civitai = new Civitai({ auth: apiKey });

const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { action, params } = JSON.parse(body);

        let result;
        if (action === 'generateImage') {
          result = await civitai.image.fromText(params);
        } else if (action === 'getJobStatus') {
          result = await (civitai as any).jobs.get(params.jobId);
        } else if (action === 'listModels') {
          // SDK 内部可能没有直接的 listModels，我们直接调用 REST API
          const url = new URL('https://civitai.com/api/v1/models');
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) url.searchParams.append(key, String(value));
          });
          if (!url.searchParams.has('limit')) url.searchParams.append('limit', '20');
          if (!url.searchParams.has('types')) url.searchParams.append('types', 'Checkpoint');

          const response = await fetch(url.toString(), {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            }
          });
          result = await response.json();
        } else {
          throw new Error(`Unknown action: ${action}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(port, () => {
  console.log(`Civitai server listening on port ${port}`);
});
