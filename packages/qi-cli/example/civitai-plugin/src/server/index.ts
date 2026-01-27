import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import { Civitai } from 'civitai';

const port = process.env.PORT || 18888;
const apiKey = process.env.CIVITAI_API_KEY;

const app = new Koa();
const router = new Router();

process.stdin.resume();
process.stdin.on('end', () => {
  process.exit(0);
});

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err: any) {
    ctx.status = err.status || 500;
    ctx.body = {
      error: err.message,
      details: err.stack,
      errorBody: err.body || null
    };
  }
});

app.use(cors());
app.use(bodyParser());

const getCivitaiInstance = (requestApiKey?: string) => {
  const effectiveApiKey = (requestApiKey && requestApiKey !== 'DUMMY_KEY' ? requestApiKey : apiKey) as string;
  if (!effectiveApiKey || effectiveApiKey === 'DUMMY_KEY') return null;
  return new Civitai({ auth: effectiveApiKey });
};

router.get('/health', (ctx) => {
  ctx.body = {
    status: 'ok',
    hasApiKey: !!apiKey && apiKey !== 'DUMMY_KEY'
  };
});

router.post('/api/generate', async (ctx) => {
  const { params, apiKey: requestApiKey } = ctx.request.body as any;

  const instance = getCivitaiInstance(requestApiKey);

  if (!instance) {
    ctx.status = 401;
    ctx.body = { error: 'Unauthorized: Civitai API Key is missing or invalid.' };
    return;
  }

  const jobInput = {
    model: String(params.model),
    params: {
      prompt: params.params.prompt,
      negativePrompt: params.params.negativePrompt || '',
      scheduler: params.params.scheduler || 'EulerA',
      steps: Number(params.params.steps) || 15,
      cfgScale: Number(params.params.cfgScale) || 3,
      width: Number(params.params.width) || 512,
      height: Number(params.params.height) || 512,
      clipSkip: params.params.clipSkip !== undefined ? Number(params.params.clipSkip) : 2,
    },
    additionalNetworks: params.additionalNetworks,
    controlNets: params.controlNets,
    batchSize: Number(params.batchSize) || 1
  };

  try {
    const result = await instance.image.fromText(jobInput, false);
    ctx.body = result;
  } catch (error: any) {
    const errorInfo = {
      message: error.message || 'Civitai SDK request failed',
      status: error.status || 500,
      body: error.body || null,
      stack: error.stack
    };
    ctx.status = errorInfo.status;
    ctx.body = {
      error: errorInfo.message,
      details: errorInfo.body ? JSON.stringify(errorInfo.body) : errorInfo.stack,
      errorBody: errorInfo.body
    };
  }
});

router.get('/api/jobs/:jobId', async (ctx) => {
  const { jobId } = ctx.params;
  const { apiKey: requestApiKey } = ctx.query;

  const instance = getCivitaiInstance(requestApiKey as string);

  if (!instance) {
    ctx.status = 401;
    ctx.body = { error: 'Unauthorized: Civitai API Key is missing or invalid.' };
    return;
  }

  try {
    try {
      const status = await instance.jobs.getById(jobId);
      ctx.body = status;
    } catch (idError: any) {
      const status = await instance.jobs.getByToken(jobId);
      ctx.body = status;
    }
  } catch (error: any) {
    ctx.status = error.status || 500;
    ctx.body = {
      error: error.message,
      details: error.body || error.stack
    };
  }
});

app.use(router.routes()).use(router.allowedMethods());

const server = app.listen(port, () => {
});

server.on('error', () => {
  process.exit(1);
});

process.on('exit', () => {
});

