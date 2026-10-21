#!/usr/bin/env node
/**
 * Generate images and video through the Agnes API.
 *
 * Used to produce asset candidates (wallpaper, splash footage) without relying
 * on stock libraries. The API key never lives in this repository:
 *
 *   AGNES_API_KEY=sk-... node scripts/agnes.mjs image --prompt "..." --out out.jpg
 *
 * or point at a file that contains the key:
 *
 *   AGNES_KEY_FILE=/path/to/agnes.md node scripts/agnes.mjs image --prompt "..."
 *
 * Image: POST /v1/images/generations; `size` is a tier (1K..4K) and `ratio`
 * picks the aspect. Video: POST /v1/videos, then poll /agnesapi until the task
 * completes. Both download the result and print its path.
 */
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const BASE = 'https://api.agnes-ai.cn/v1'
const QUERY = 'https://api.agnes-ai.cn/agnesapi'
const IMAGE_MODEL = 'agnes-image-2.5-flash'
const VIDEO_MODEL = 'agnes-video-2.5-flash'

/** Read `--name value` / `--flag` pairs. */
function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) { args._.push(token); continue }
    const name = token.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) { args[name] = true; continue }
    if (name === 'ref') { (args.ref ??= []).push(next); i += 1; continue }
    args[name] = next
    i += 1
  }
  return args
}

/** Resolve the API key from the environment or a key file. */
async function apiKey() {
  if (process.env.AGNES_API_KEY) return process.env.AGNES_API_KEY.trim()
  const file = process.env.AGNES_KEY_FILE
  if (file === undefined) {
    throw new Error('set AGNES_API_KEY, or AGNES_KEY_FILE to a file containing sk-...')
  }
  const text = await readFile(file, 'utf8')
  const match = text.match(/sk-[A-Za-z0-9_-]+/)
  if (match === null) throw new Error(`${file}: no sk-... key found`)
  return match[0]
}

/** POST JSON and fail with the response body on a non-2xx status. */
async function postJson(url, body, key) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  return response.json()
}

/** Encode one reference image as a data URI the API accepts. */
async function dataUri(file) {
  const bytes = await readFile(file)
  const ext = file.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
  return `data:image/${ext};base64,${bytes.toString('base64')}`
}

/** Retry while the service reports a full queue (503). */
async function postJsonRetry(url, body, key, attempts = 12) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await postJson(url, body, key)
    } catch (error) {
      const busy = String(error.message).startsWith('503')
      if (!busy || attempt >= attempts) throw error
      const wait = Math.min(10000 + attempt * 5000, 45000)
      console.log(`  queue busy, retrying in ${(wait / 1000).toFixed(0)}s (${attempt}/${attempts})`)
      await new Promise(r => setTimeout(r, wait))
    }
  }
}

/** Map the first bytes of a file to the extension the server actually sent. */
function extensionOf(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return '.png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return '.jpg'
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return '.webp'
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return '.gif'
  return undefined
}

/**
 * Download a URL into `out`, creating its parent directory, and correct the
 * extension when the server's format differs from the requested name.
 */
async function download(url, out) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`download failed: ${response.status}`)
  let target = resolve(out)
  await mkdir(dirname(target), { recursive: true })
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target))
  const head = (await readFile(target)).subarray(0, 4)
  const ext = extensionOf(head)
  if (ext !== undefined && !target.toLowerCase().endsWith(ext)) {
    const renamed = target.replace(/\.[^.]+$/, '') + ext
    await rename(target, renamed)
    target = renamed
  }
  return target
}

/** Generate one image. */
async function image(args, key) {
  const prompt = args.prompt
  if (typeof prompt !== 'string') throw new Error('image needs --prompt')
  const size = typeof args.size === 'string' ? args.size : '2K'
  const ratio = typeof args.ratio === 'string' ? args.ratio : '16:9'
  const out = typeof args.out === 'string' ? args.out : 'agnes-image.jpg'
  const started = Date.now()
  const refs = Array.isArray(args.ref) ? await Promise.all(args.ref.map(dataUri)) : []
  const base = {
    model: IMAGE_MODEL,
    prompt,
    size,
    ratio,
    extra_body: { response_format: 'url', ...refs.length > 0 ? { image: refs } : {} },
  }
  let result
  try {
    result = await postJsonRetry(`${BASE}/images/generations`, base, key)
  } catch (error) {
    // Docs mention both `extra_body.image` and a top-level `image`; retry once.
    if (refs.length === 0 || !String(error.message).startsWith('400')) throw error
    result = await postJsonRetry(`${BASE}/images/generations`, { ...base, image: refs }, key)
  }
  const item = result.data?.[0]
  if (item?.url == null) throw new Error(`unexpected response: ${JSON.stringify(result).slice(0, 300)}`)
  const path = await download(item.url, out)
  console.log(`image: ${path} (${size} ${ratio}, ${((Date.now() - started) / 1000).toFixed(1)}s)`)
}

/** Create a video and poll until it is downloadable. */
async function video(args, key) {
  const prompt = args.prompt
  if (typeof prompt !== 'string') throw new Error('video needs --prompt')
  const seconds = typeof args.seconds === 'string' ? args.seconds : '5'
  const ratio = typeof args.ratio === 'string' ? args.ratio : '16:9'
  const out = typeof args.out === 'string' ? args.out : 'agnes-video.mp4'
  const body = {
    model: VIDEO_MODEL,
    prompt,
    seconds,
    mode: 'text',
    size: '720P',
    aspect_ratio: ratio,
  }
  // The service rejects creation while its queue is full; that is transient.
  let created
  for (let attempt = 1; ; attempt += 1) {
    try {
      created = await postJsonRetry(`${BASE}/videos`, body, key)
      break
    } catch (error) {
      const busy = String(error.message).includes('video_queue_full')
      if (!busy || attempt >= 4) throw error
      console.log(`  video queue full, retrying (${attempt}/4)`)
      await new Promise(r => setTimeout(r, 15000))
    }
  }
  const id = created.id ?? created.video_id ?? created.task_id
  if (id == null) throw new Error(`unexpected create response: ${JSON.stringify(created).slice(0, 300)}`)
  console.log(`video task: ${id}`)

  const deadline = Date.now() + 15 * 60 * 1000
  let wait = 3000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, wait))
    const url = `${QUERY}?video_id=${encodeURIComponent(id)}&model_name=${VIDEO_MODEL}`
    const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` } })
    // The query endpoint rate-limits quick polls; back off instead of failing
    // the whole task, and keep the bound so a stuck task still ends.
    if (response.status === 429) {
      wait = Math.min(Math.round(wait * 1.6), 20000)
      console.log(`  rate limited, retrying in ${(wait / 1000).toFixed(0)}s`)
      continue
    }
    if (!response.ok) throw new Error(`poll failed: ${response.status} ${await response.text()}`)
    const task = await response.json()
    console.log(`  ${task.status ?? 'unknown'} ${task.progress ?? 0}%`)
    if (task.status === 'completed') {
      if (task.url == null) throw new Error('completed without a url')
      const path = await download(task.url, out)
      console.log(`video: ${path} (${seconds}s)`)
      return
    }
    if (task.status === 'failed') throw new Error(`task failed: ${task.error ?? 'unknown error'}`)
  }
  throw new Error('video task timed out after 15 minutes')
}

const args = parseArgs(process.argv.slice(2))
const command = args._[0]
const key = await apiKey()
if (command === 'image') await image(args, key)
else if (command === 'video') await video(args, key)
else {
  console.error('usage: agnes.mjs image|video --prompt "..." [--size 2K] [--ratio 16:9] [--out file]')
  process.exit(1)
}
