#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 tools/audio_texts.json 里的每条文本生成温柔女声 MP3 -> audio/<hash>.mp3
文件名 = FNV-1a 32bit( lang + '|' + text )，与 js/app.js 的 hashText 完全一致。
支持断点续跑：已存在且体积正常的文件自动跳过。
"""
import asyncio
import json
import os
import sys
import time

import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEXTS = os.path.join(ROOT, "tools", "audio_texts.json")
AUDIO_DIR = os.path.join(ROOT, "audio")
FAIL_LOG = os.path.join(ROOT, "tools", "audio_failures.json")

VOICE = {
    "zh-CN": ("zh-CN-XiaoxiaoNeural", "-6%", "+3Hz"),
    "en-US": ("en-US-AriaNeural", "-6%", "+2Hz"),
}
WORKERS = 8
MIN_BYTES = 800


def fnv1a(s: str) -> str:
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return format(h, "08x")


def target_path(lang: str, text: str) -> str:
    return os.path.join(AUDIO_DIR, fnv1a(lang + "|" + text) + ".mp3")


async def synth_one(item, sem, stats, failures, total):
    lang = item["lang"]
    text = item["text"]
    path = target_path(lang, text)

    if os.path.exists(path) and os.path.getsize(path) >= MIN_BYTES:
        stats["skip"] += 1
        return

    voice, rate, pitch = VOICE.get(lang, VOICE["zh-CN"])
    async with sem:
        for attempt in range(4):
            try:
                tmp = path + ".tmp"
                comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
                await comm.save(tmp)
                if os.path.getsize(tmp) < MIN_BYTES:
                    raise RuntimeError("empty audio")
                os.replace(tmp, path)
                stats["ok"] += 1
                break
            except Exception as exc:  # noqa: BLE001
                try:
                    if os.path.exists(path + ".tmp"):
                        os.remove(path + ".tmp")
                except OSError:
                    pass
                if attempt == 3:
                    stats["fail"] += 1
                    failures.append({"lang": lang, "text": text, "error": str(exc)})
                else:
                    await asyncio.sleep(0.8 * (attempt + 1))

        done = stats["ok"] + stats["fail"] + stats["skip"]
        if done % 100 == 0:
            print(f"  进度 {done}/{total}  ok={stats['ok']} skip={stats['skip']} fail={stats['fail']}", flush=True)


async def main():
    with open(TEXTS, "r", encoding="utf-8") as f:
        items = json.load(f)

    os.makedirs(AUDIO_DIR, exist_ok=True)
    total = len(items)
    print(f"待处理文本 {total} 条，并发 {WORKERS}", flush=True)

    sem = asyncio.Semaphore(WORKERS)
    stats = {"ok": 0, "skip": 0, "fail": 0}
    failures = []
    t0 = time.time()

    await asyncio.gather(*(synth_one(it, sem, stats, failures, total) for it in items))

    with open(FAIL_LOG, "w", encoding="utf-8") as f:
        json.dump(failures, f, ensure_ascii=False, indent=2)

    el = time.time() - t0
    print(f"完成：新增 {stats['ok']}，跳过 {stats['skip']}，失败 {stats['fail']}，用时 {el:.1f}s", flush=True)
    if failures:
        print(f"失败清单已写入 {FAIL_LOG}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
