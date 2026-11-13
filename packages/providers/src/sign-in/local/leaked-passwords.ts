// A handful of the most common leaked passwords, so the stand-in refuses them the way
// the real service refuses everything on the public lists (T-85). The real check is
// the vendor's, against millions of entries; this list only lets tests and local
// screens show the refusal. Not for production.
export const sampleLeakedPasswords: readonly string[] = [
  '12345678',
  '123456789',
  '1234567890',
  '11111111',
  '87654321',
  'password',
  'password1',
  'password123',
  'passw0rd',
  'qwertyuiop',
  'qwerty123',
  'iloveyou',
  'sunshine1',
  'football',
  'baseball',
  'basketball',
  'princess',
  'welcome1',
  'abc12345',
  'letmein1',
];
