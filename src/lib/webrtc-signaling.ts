import type { ATSMSWebRTCContent } from "@atsms/sms";
import { getStorageManager, getEndpointCert } from "./atsms-bridge";

export async function sendWebRTCSignal(
  convoId: string,
  content: ATSMSWebRTCContent,
): Promise<void> {
  const sm = getStorageManager();
  const cert = getEndpointCert();
  if (!sm || !cert) throw new Error("Not initialized");
  await sm.sendWebRTC(convoId, content, cert);
}
