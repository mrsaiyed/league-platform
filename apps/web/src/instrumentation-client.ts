// Runs in the browser before any of the app's own code (Next.js's instrumentation-client).
//
// The script policy refuses `eval` and `new Function` (T-79, record 081). Zod, which reads
// the live game's messages and the tracker's answers in the browser, asks once whether it
// may build its checks with `new Function` and, refused, checks without it: the answers are
// the same either way. Told here not to try, it never asks, so the browser reports no
// refusal on every page and the policy's reports stay for real attacks.
import { z } from 'zod';

z.config({ jitless: true });
