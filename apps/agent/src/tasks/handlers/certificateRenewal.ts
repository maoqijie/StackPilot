import { CertificateRenewalTaskParametersSchema, type RemoteTaskResultSummary } from "@stackpilot/contracts";
import { requestCertHelper } from "../../sites/helperClient.js";

export async function certificateRenewalHandler(parameters: unknown, signal: AbortSignal): Promise<RemoteTaskResultSummary> {
  const input = CertificateRenewalTaskParametersSchema.parse(parameters);
  const renewed: string[] = [];
  for (const certificate of input.certificates) {
    await requestCertHelper({ operation: "renew", certificateId: certificate.certificateId }, signal);
    renewed.push(certificate.certificateId);
  }
  return { message: `${renewed.length} certificate renewal operation(s) completed`, data: { batchId: input.batchId, certificateIds: renewed }, truncated: false };
}
