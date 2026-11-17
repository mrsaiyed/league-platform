// The addresses Cloudflare's servers reach other servers from (record 081), so the web app
// can tell whether a request came to the host through Cloudflare before it believes the
// visitor's address Cloudflare names (CF-Connecting-IP, TRUSTED_PROXY=cloudflare). Copied
// by hand from the lists Cloudflare publishes, https://www.cloudflare.com/ips-v4 and
// https://www.cloudflare.com/ips-v6, as they stood when this was written; nothing here
// fetches them. Cloudflare changes them rarely and says so in advance: whoever sets
// TRUSTED_PROXY=cloudflare compares these with the published lists first (record 081 says
// when and how), and a range missing here only makes that range's visitors share one
// key (fails closed); it never lets a visitor choose their own address.
import { BlockList, isIP } from 'node:net';

/** Cloudflare's published IPv4 ranges. */
export const cloudflareIpv4Ranges: readonly string[] = [
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '108.162.192.0/18',
  '131.0.72.0/22',
  '141.101.64.0/18',
  '162.158.0.0/15',
  '172.64.0.0/13',
  '173.245.48.0/20',
  '188.114.96.0/20',
  '190.93.240.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
];

/** Cloudflare's published IPv6 ranges. */
export const cloudflareIpv6Ranges: readonly string[] = [
  '2400:cb00::/32',
  '2405:8100::/32',
  '2405:b500::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

const cloudflare = new BlockList();
for (const [ranges, type] of [
  [cloudflareIpv4Ranges, 'ipv4'],
  [cloudflareIpv6Ranges, 'ipv6'],
] as const) {
  for (const range of ranges) {
    const [network = '', prefix = ''] = range.split('/');
    cloudflare.addSubnet(network, Number(prefix), type);
  }
}

/**
 * Whether `address` (an IPv4 or IPv6 address, an IPv6 one in brackets or with an IPv4
 * address inside it too) is one of Cloudflare's. Anything that is not an address is not.
 */
export function isCloudflareAddress(address: string): boolean {
  const bare = address
    .trim()
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/%.*$/, '');
  const version = isIP(bare);
  if (version === 0) return false;
  return cloudflare.check(bare, version === 4 ? 'ipv4' : 'ipv6');
}
