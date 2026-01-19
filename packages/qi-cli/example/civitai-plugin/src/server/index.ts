import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import { Civitai } from 'civitai';

const port = process.env.PORT || 18888;
const apiKey = process.env.CIVITAI_API_KEY;

const app = new Koa();
const router = new Router();

// 详细的启动日志
console.log('--- Civitai Server (Koa) Starting ---');
console.log('Environment Variables:');
console.log(`  PORT: ${port}`);
console.log(`  CIVITAI_API_KEY: ${apiKey ? 'PRESENT (HIDDEN)' : 'MISSING'}`);

// 错误处理中间件
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err: any) {
    console.error('\x1b[31m[RUNTIME ERROR]\x1b[0m', err);
    ctx.status = err.status || 500;
    ctx.body = {
      error: err.message,
      details: err.stack,
      errorBody: err.body || null
    };
  }
});

// 捕获进程级错误
process.on('uncaughtException', (err) => {
  console.error('\x1b[31m[FATAL ERROR] Uncaught Exception:\x1b[0m');
  console.error(err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\x1b[31m[FATAL ERROR] Unhandled Rejection at:\x1b[0m', promise);
  console.error('\x1b[31mReason:\x1b[0m', reason);
});

app.use(cors());
app.use(bodyParser());

// 辅助函数：获取有效的 Civitai 实例
const getCivitaiInstance = (requestApiKey?: string) => {
  const effectiveApiKey = (requestApiKey && requestApiKey !== 'DUMMY_KEY' ? requestApiKey : apiKey) as string;
  if (!effectiveApiKey || effectiveApiKey === 'DUMMY_KEY') return null;
  return new Civitai({ auth: effectiveApiKey });
};

// 健康检查
router.get('/health', (ctx) => {
  ctx.body = {
    status: 'ok',
    hasApiKey: !!apiKey && apiKey !== 'DUMMY_KEY'
  };
});

// 更新全局配置 (API Key)
router.post('/api/config', (ctx) => {
  const { apiKey: newApiKey } = ctx.request.body as any;
  if (newApiKey && newApiKey !== 'DUMMY_KEY') {
    // 更新全局变量
    process.env.CIVITAI_API_KEY = newApiKey;
    // 这里的 apiKey 是闭包里的，所以需要直接修改全局引用或重新赋值
    ctx.body = { success: true };
  } else {
    ctx.status = 400;
    ctx.body = { error: 'Invalid API Key' };
  }
});

// 生成图片
router.post('/api/generate', async (ctx) => {
  console.log('Received /api/generate request');
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
      steps: Number(params.params.steps) || 20,
      cfgScale: Number(params.params.cfgScale) || 7,
      width: Number(params.params.width) || 512,
      height: Number(params.params.height) || 512,
      clipSkip: params.params.clipSkip !== undefined ? Number(params.params.clipSkip) : 2,
    },
    additionalNetworks: params.additionalNetworks,
    controlNets: params.controlNets,
    batchSize: Number(params.batchSize) || 1
  };

  try {
    const result = await instance.image.fromText(jobInput);
    console.log('Civitai SDK response success');
    ctx.body = result;
  } catch (error: any) {
    console.error('Civitai SDK error:', error);
    // 尝试输出更详细的错误信息
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

// 获取任务状态
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
    console.log(`Querying job status for ID: ${jobId}`);
    try {
      // 首先尝试通过 ID 获取
      const status = await instance.jobs.getById(jobId);
      ctx.body = status;
    } catch (idError: any) {
      console.log(`Failed to get job by ID, trying by token...`);
      // 如果 ID 获取失败（比如传入的是 token），尝试通过 Token 获取
      const status = await instance.jobs.getByToken(jobId);
      ctx.body = status;
    }
  } catch (error: any) {
    console.error('Civitai getJob error:', error);
    ctx.status = error.status || 500;
    ctx.body = {
      error: error.message,
      details: error.body || error.stack
    };
  }
});

app.use(router.routes()).use(router.allowedMethods());

const server = app.listen(port, () => {
  console.log(`Civitai server (Koa) listening on port ${port}`);
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\x1b[31m[ERROR]\x1b[0m Port ${port} is already in use.`);
  } else {
    console.error(`\x1b[31m[SERVER ERROR]\x1b[0m`, err);
  }
  process.exit(1);
});

process.on('exit', (code) => {
  if (code !== 0) {
    console.log(`Server process exiting with code: ${code}`);
  }
});
