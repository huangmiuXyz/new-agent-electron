import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import { Civitai } from 'civitai';

const port = process.env.PORT || 18888;
const apiKey = process.env.CIVITAI_API_KEY;

let civitaiInstance = new Civitai({ auth: apiKey! })

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

  const modelId = String(params.model);
  const baseModel = params.baseModel;

  // 核心修复：根据 SDK 的 Zod 校验规则，model 字段必须是字符串。
  let modelValue: string = modelId;
  if (!isNaN(Number(modelId)) && !modelId.includes(':')) {
    // 构造 AIR 格式：不再根据 ID 猜测，直接根据传入的 baseModel 处理
    let airBase = "sd1-5";
    if (baseModel) {
      const lowerBase = baseModel.toLowerCase();
      if (lowerBase.includes("sdxl")) {
        airBase = "sdxl";
      } else if (lowerBase.includes("pony")) {
        airBase = "pony";
      } else if (lowerBase.includes("sd 1.5")) {
        airBase = "sd1-5";
      }
    }

    modelValue = `urn:air:${airBase}:checkpoint:civitai:${modelId}`;
    console.log(`Converting numeric ID ${modelId} to AIR format with provided base ${baseModel}: ${modelValue}`);
  }

  const jobInput: any = {
    model: modelValue,
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
    quantity: Number(params.batchSize) || 1,
    baseModel: baseModel
  };

  if (params.additionalNetworks && Object.keys(params.additionalNetworks).length > 0) {
    jobInput.additionalNetworks = params.additionalNetworks;
  }

  if (params.controlNets && Array.isArray(params.controlNets) && params.controlNets.length > 0) {
    jobInput.controlNets = params.controlNets;
  }

  // 只有当 seed 有效且不是 -1 时才传递
  const seed = Number(params.params.seed);
  if (!isNaN(seed) && seed !== -1) {
    jobInput.params.seed = seed;
  }

  // 只有当 callbackUrl 有效时才传递
  if (params.callbackUrl && typeof params.callbackUrl === 'string' && params.callbackUrl.startsWith('http')) {
    jobInput.callbackUrl = params.callbackUrl;
  }

  console.log('Sending SDK request to Civitai with input:', JSON.stringify(jobInput, null, 2));

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
    const status = await instance.jobs.getById(jobId);
    ctx.body = status;
  } catch (error: any) {
    ctx.status = error.status || 500;
    ctx.body = { error: error.message };
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
