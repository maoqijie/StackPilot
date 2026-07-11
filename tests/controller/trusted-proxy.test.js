import assert from "node:assert/strict";
import test from "node:test";
import { requestProtocol, requestSource } from "../../apps/controller/dist/http/trustedProxy.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";

function request(remoteAddress,headers={}){return{headers,socket:{remoteAddress}};}

test("forwarded headers are ignored unless the direct peer is explicitly trusted",()=>{
 const forged=request("203.0.113.10",{"x-forwarded-for":"127.0.0.1","x-forwarded-proto":"https",forwarded:"for=127.0.0.1;proto=https"});
 assert.equal(requestSource(forged,["127.0.0.1/32"]),"203.0.113.10");
 assert.equal(requestProtocol(forged,["127.0.0.1/32"]),"http");
 const proxied=request("::ffff:127.0.0.1",{forwarded:'for="198.51.100.12";proto=https'});
 assert.equal(requestSource(proxied,["127.0.0.1/32"]),"198.51.100.12");
 assert.equal(requestProtocol(proxied,["127.0.0.1/32"]),"https");
});

test("production configuration requires secure cookies and valid trusted proxy CIDRs",()=>{
 assert.throws(()=>loadControllerConfig({STACKPILOT_PRODUCTION:"1",STACKPILOT_COOKIE_SECURE:"0"}),/Secure Cookie/);
 assert.throws(()=>loadControllerConfig({STACKPILOT_TRUSTED_PROXIES:"proxy.internal"}),/IP 或 CIDR/);
 const config=loadControllerConfig({STACKPILOT_TRUSTED_PROXIES:"127.0.0.1/32,10.0.0.0/8"});
 assert.deepEqual(config.trustedProxies,["127.0.0.1/32","10.0.0.0/8"]);
});
