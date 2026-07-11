import { chmod, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import selfsigned from "selfsigned";

const output = resolve(process.argv[2] ?? ".stackpilot/dev-certs");
const certificate = await selfsigned.generate([{ name: "commonName", value: "localhost" }], {
  keySize: 2048,
  days: 30,
  algorithm: "sha256",
  extensions: [
    { name: "basicConstraints", cA: true },
    { name: "keyUsage", keyCertSign: true, digitalSignature: true, keyEncipherment: true },
    { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }] },
  ],
});
await mkdir(output, { recursive: true, mode: 0o700 });
await chmod(output, 0o700);
await writeFile(resolve(output, "controller-cert.pem"), certificate.cert, { mode: 0o600 });
await writeFile(resolve(output, "controller-key.pem"), certificate.private, { mode: 0o600 });
process.stdout.write(`Development-only Agent TLS certificate created in ${output}\n`);
