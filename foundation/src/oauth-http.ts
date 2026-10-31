import express,{type ErrorRequestHandler} from 'express';
import {createServer,type Server} from 'node:http';
import {type OAuthConfig} from './core-config.ts';
import {type LocalOAuthProvider} from './oauth-provider.ts';
import {authorizationHandler} from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import {tokenHandler} from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import {revocationHandler} from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';

export async function startOAuthHttp(config:OAuthConfig,provider:LocalOAuthProvider):Promise<Server>{
 const app=express();app.disable('x-powered-by');app.set('trust proxy',false);
 app.use((_request,response,next)=>{response.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});next();});
 app.get('/.well-known/oauth-authorization-server',(_request,response)=>{response.json({issuer:config.issuer,authorization_endpoint:config.issuer+'/authorize',token_endpoint:config.issuer+'/token',revocation_endpoint:config.issuer+'/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],revocation_endpoint_auth_methods_supported:['none'],scopes_supported:config.client.actions});});
 app.use('/authorize',express.urlencoded({extended:false,limit:4096,parameterLimit:16}),(request,response,next)=>{
  const input=request.method==='POST'?request.body:request.query;
  const keys=['client_id','redirect_uri','response_type','code_challenge_method','code_challenge','resource','scope','state'];
  if(!input||Object.keys(input).some(k=>!keys.includes(k)||typeof input[k]!=='string')||input.client_id!==config.client.clientId||!config.client.redirectUris.includes(input.redirect_uri)||input.response_type!=='code'||input.code_challenge_method!=='S256'||typeof input.code_challenge!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(input.code_challenge)||input.resource!==config.resource||typeof input.scope!=='string'||!input.scope||(input.scope.split(' ').includes('memory:selected:read')&&input.scope!=='memory:selected:read')||input.scope.split(' ').some((s:string)=>!config.client.actions.includes(s))||new Set(input.scope.split(' ')).size!==input.scope.split(' ').length||(input.state!==undefined&&!/^[\x21-\x7e]{1,512}$/.test(input.state))){response.status(400).json({error:'invalid_request'});return;}next();
 },authorizationHandler({provider}));
 app.use('/token',express.urlencoded({extended:false,limit:4096,parameterLimit:16}),(request,response,next)=>{
  const input=request.body,keys=['grant_type','client_id','code','code_verifier','redirect_uri','resource'];
  if(request.method!=='POST'||!input||Object.keys(input).some(k=>!keys.includes(k)||typeof input[k]!=='string')||(input.grant_type==='authorization_code'&&(typeof input.code_verifier!=='string'||!/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier)))){response.status(400).json({error:'invalid_request'});return;}next();
 },tokenHandler({provider}));
 app.use('/revoke',revocationHandler({provider}));
 app.use((_request,response)=>{response.status(404).json({error:'not_found'});});
 const failure:ErrorRequestHandler=(_error,_request,response,next)=>{void next;response.status(400).json({error:'invalid_request'});};app.use(failure);
 const server=createServer(app);server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=1000;
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(config.port,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
 return server;
}
export async function stopOAuthHttp(server:Server):Promise<void>{await new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(new Error('oauth_shutdown_failed')):resolve());server.closeAllConnections();});}
