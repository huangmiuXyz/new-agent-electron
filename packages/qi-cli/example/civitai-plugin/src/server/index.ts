import express from 'express';
import cors from 'cors';
import { Civitai } from 'civitai';

const port = process.env.PORT || 18888;
const apiKey = process.env.CIVITAI_API_KEY;

let civitai = apiKey && apiKey !== 'DUMMY_KEY' ? new Civitai({ auth: apiKey }) : null;

const app = express();

// 捕获未处理的异常，防止服务器崩溃
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.use(cors());
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!civitai
  });
});

// API 路由

// 更新配置 (API Key)
app.post('/api/config', (req, res) => {
  const { apiKey: newApiKey } = req.body;
  if (newApiKey && newApiKey !== 'DUMMY_KEY') {
    civitai = new Civitai({ auth: newApiKey });
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid API Key' });
  }
});

// 生成图片
app.post('/api/generate', async (req, res) => {
  console.log('Received /api/generate request');
  try {
    const { params, apiKey: newApiKey } = req.body;
    if (newApiKey && newApiKey !== 'DUMMY_KEY') {
      civitai = new Civitai({ auth: newApiKey });
    }
    if (!civitai) {
      throw new Error('CIVITAI_API_KEY is not configured.');
    }

    const modelId = String(params.model);

    const sdkParams = {
      model: modelId,
      params: {
        prompt: params.params.prompt,
        negativePrompt: params.params.negativePrompt || '',
        scheduler: params.params.scheduler || 'EulerA',
        steps: params.params.steps || 20,
        cfgScale: params.params.cfgScale || 7,
        width: Number(params.params.width) || 512,
        height: Number(params.params.height) || 512,
        seed: params.params.seed !== undefined ? Number(params.params.seed) : undefined,
        clipSkip: params.params.clipSkip !== undefined ? Number(params.params.clipSkip) : 2,
      },
      additionalNetworks: params.additionalNetworks,
      controlNets: params.controlNets,
      callbackUrl: params.callbackUrl,
      quantity: Number(params.batchSize) || 1,
    };

    const result = await civitai.image.fromText(sdkParams, false);
    res.json(result);
  } catch (err: any) {
    let errorBody = null;
    if (err.body) {
      errorBody = err.body;
    }

    res.status(500).json({
      error: err.message,
      errorBody: errorBody,
      details: err.stack,
      sentParams: req.body.params
    });
  }
});

// 获取任务状态
app.get('/api/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { apiKey: queryApiKey } = req.query;

    if (queryApiKey && queryApiKey !== 'DUMMY_KEY') {
      civitai = new Civitai({ auth: queryApiKey as string });
    }

    if (!civitai) {
      throw new Error('CIVITAI_API_KEY is not configured.');
    }
    const result = await civitai.jobs.getById(jobId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Civitai server listening on port ${port}`);
});
