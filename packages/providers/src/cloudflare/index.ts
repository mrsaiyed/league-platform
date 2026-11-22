// Cloudflare (record 081): the addresses its servers reach the host from. Used only
// through the package's index.ts.
export {
  cloudflareIpv4Ranges,
  cloudflareIpv6Ranges,
  isCloudflareAddress,
} from './cloudflare-addresses.ts';
