// Deno loads this package from npm at run time; this only teaches the editor its shape.
declare module 'npm:web-push@3.6.7' {
  interface Subscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }
  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(subscription: Subscription, payload?: string, options?: { TTL?: number }): Promise<unknown>;
  };
  export default webpush;
}
