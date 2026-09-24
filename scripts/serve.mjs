import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('public');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(pathname==='/'){res.writeHead(302,{Location:'/homepage/'});return res.end();}if(!pathname.startsWith('/homepage/'))throw Error('404');pathname=pathname.slice('/homepage/'.length);let file=path.resolve(root,pathname||'index.html');if(file!==root&&!file.startsWith(root+path.sep))throw Error('404');if((await stat(file)).isDirectory())file=path.join(file,'index.html');const content=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(content);}catch{res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end(await readFile(path.join(root,'404.html')));}});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('OneBe preview: http://127.0.0.1:4173/homepage/'));

