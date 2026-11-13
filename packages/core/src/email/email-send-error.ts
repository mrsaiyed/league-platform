// An email the service did not accept. Its code is a fixed word and its message
// never holds the address, the content or a key, so it can be logged and stored as
// a job's last error (T-86). `retryable` tells the queue whether trying again later
// can help (job-failures.ts).

export type EmailSendErrorCode =
  /** The service refused this message as it is (a bad address, a bad sender). */
  | 'rejected'
  /** Our key or account was refused: trying again will not help until someone acts. */
  | 'not-authorized'
  /** Too many sends for now. */
  | 'rate-limited'
  /** The service could not be reached, or failed on its side. */
  | 'unavailable'
  /** The service accepted it but answered in a way we did not expect. */
  | 'unexpected-answer';

export class EmailSendError extends Error {
  readonly code: EmailSendErrorCode;
  readonly retryable: boolean;
  /** The service's HTTP status, when there was one. */
  readonly status: number | undefined;

  constructor(code: EmailSendErrorCode, retryable: boolean, status?: number) {
    super(`The email was not sent: ${code}${status === undefined ? '' : ` (${status})`}.`);
    this.name = 'EmailSendError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}
