import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {renderPage} from '../src/template.mjs';
import {site} from '../src/data.mjs';
await mkdir('public/assets',{recursive:true});
await writeFile('public/index.html',renderPage());
for(const file of ['styles.css','main.js','analytics.js']) await copyFile('src/'+file,'public/assets/'+file);
await writeFile('public/sitemap.xml','<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+site.url+'</loc><lastmod>'+site.updated+'</lastmod></url></urlset>\n');
await writeFile('public/.nojekyll','');
await writeFile('public/404.html','<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>ページが見つかりません｜OneBe</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f6f2;color:#111c38;font-family:system-ui,sans-serif;text-align:center}main{padding:32px}h1{font-size:28px}a{color:inherit;display:inline-block;margin:24px;padding:16px 28px;border:1px solid;border-radius:8px}</style></head><body><main><p>OneBe / 404</p><h1>ページが見つかりません</h1><p>URLをご確認いただくか、トップページからご覧ください。</p><a href="'+site.url+'">定額Webサービスのトップへ</a></main></body></html>');
console.log('Built static OneBe landing page, assets, sitemap and 404.');

