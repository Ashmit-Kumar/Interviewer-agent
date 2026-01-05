import Vapi from "@vapi-ai/web";

export class VapiClient {
  private vapi: Vapi;

  constructor(publicKey: string) {
    this.vapi = new Vapi(publicKey);
  }

  async startCall(assistantId: string, metadata?: Record<string, any>) {
    return await this.vapi.start(assistantId, { metadata });
  }

  stopCall() {
    this.vapi.stop();
  }

  setMuted(muted: boolean) {
    this.vapi.setMuted(muted);
  }

  on(event: string, callback: (data: any) => void) {
    this.vapi.on(event, callback);
  }

  off(event: string, callback: (data: any) => void) {
    this.vapi.off(event, callback);
  }
}

export default VapiClient;
