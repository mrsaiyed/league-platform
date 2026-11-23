// The migration login's password for `npm run release -- --hosted` (step 2.95, T-300):
// asked at the person's own terminal with the typing hidden, never taken from the command
// line or a setting, so it never lands in the shell's history file or in terminal text
// pasted into a chat. Nothing here prints, keeps or throws what was typed.

/**
 * Whether a text carries a password in an address: something after "://" with a ":"
 * before its last "@" (user:password@host). Read loosely on purpose, so a password with
 * unescaped characters, or an address inside an option such as --db=..., is still seen.
 */
export function addressCarriesPassword(text) {
  if (typeof text !== 'string') return false;
  const start = text.indexOf('://');
  if (start === -1) return false;
  const rest = text.slice(start + 3);
  const at = rest.lastIndexOf('@');
  return at !== -1 && rest.slice(0, at).includes(':');
}

/** The address with the typed password put in (escaped); unchanged when none was typed. */
export function withPassword(url, password) {
  if (password === '') return url;
  const address = new URL(url);
  address.password = encodeURIComponent(password);
  return address.toString();
}

/**
 * Asks `question` on `output` and reads one line from `input` with nothing echoed: the
 * terminal is put in raw mode, so the typed characters are never shown, and each key is
 * read here. Enter ends it, Backspace removes the last character, Ctrl+C rejects with
 * `stopped` (an error that names nothing typed). Resolves to what was typed.
 */
export function askHidden({ input, output, question, stopped }) {
  return new Promise((resolve, reject) => {
    let typed = [];
    const wasRaw = input.isRaw === true;
    const finish = (settle) => {
      input.off('data', onData);
      input.setRawMode?.(wasRaw);
      input.pause?.();
      output.write('\n');
      settle();
    };
    function onData(chunk) {
      for (const key of String(chunk)) {
        if (key === '\r' || key === '\n' || key === '\u0004') {
          const answer = typed.join('');
          typed = [];
          finish(() => resolve(answer));
          return;
        }
        if (key === '\u0003') {
          typed = [];
          finish(() => reject(stopped));
          return;
        }
        // An arrow or other special key: the rest of its sequence is not a password.
        if (key === '\u001b') break;
        if (key === '\u007f' || key === '\b') typed.pop();
        else if (key >= ' ') typed.push(key);
      }
    }
    output.write(question);
    input.setRawMode?.(true);
    input.setEncoding?.('utf8');
    input.on('data', onData);
    input.resume?.();
  });
}
