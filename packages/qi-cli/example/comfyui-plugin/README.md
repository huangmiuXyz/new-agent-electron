# ComfyUI Plugin

ComfyUI image provider plugin for Agent-Qi.

## Features

- Register `comfyui` as a provider type.
- Submit workflow jobs through ComfyUI `/prompt`.
- Poll task status from `/history/{prompt_id}`.
- Render generated images through `/view`.

## Usage

1. Start ComfyUI (default: `http://127.0.0.1:8188`).
2. Export your workflow from ComfyUI as **API format JSON**.
3. Open plugin settings and fill:
   - `Base URL`
   - `Workflow JSON`
   - path mappings (prompt/seed/size/batch)
4. Select provider `ComfyUI` in image generation page and generate.

## Notes

- If ComfyUI is remote and browser CORS is blocked, start ComfyUI with CORS enabled.
- `Prompt Path` format example: `6.inputs.text`
- `Overrides JSON` format example:

```json
{
  "3.inputs.cfg": 7,
  "3.inputs.steps": 28
}
```
