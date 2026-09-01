/**
 * The build helper, as a command.
 *
 * Prints the port and the pairing token and then gets out of the way. The token
 * is generated per run unless one is supplied, so a helper left running does not
 * become a standing open door on the machine.
 *
 * `import.meta` lives here and nowhere else in this package: everything the
 * tests import has to stay loadable as CommonJS.
 */
import path from 'node:path';
import process from 'node:process';

import { BuildHelperServer } from './server';
import { EasBuilder, FakeBuilder, type Builder } from './builder';

interface Options {
  port: number;
  workDirectory: string;
  allowedOrigins: string[];
  builder: 'fake' | 'eas';
  stagedProject?: string;
  token?: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    port: 8790,
    workDirectory: path.resolve(process.cwd(), '.vne-builds'),
    allowedOrigins: [],
    builder: 'eas',
  };

  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--port': options.port = Number(argv[++i]); break;
      case '--work-dir': options.workDirectory = path.resolve(argv[++i]); break;
      case '--allow-origin': options.allowedOrigins.push(argv[++i]); break;
      case '--builder': {
        const value = argv[++i];
        if (value !== 'fake' && value !== 'eas') {
          console.error(`--builder must be fake or eas, got "${value}"`);
          process.exit(1);
        }
        options.builder = value;
        break;
      }
      case '--staged-project': options.stagedProject = path.resolve(argv[++i]); break;
      case '--token': options.token = argv[++i]; break;
      case '--help':
      case '-h':
        console.log(`
Local build helper for Visual Novel Engine.

  --port <n>              Listen on this port (default 8790).
  --work-dir <dir>        Jobs, uploads and artifacts (default ./.vne-builds).
  --allow-origin <origin> Loopback origin the browser will connect from.
                          Repeatable; defaults to the AI bridge's.
  --builder <fake|eas>    Which builder to use. Default eas; fake is test-only.
  --staged-project <dir>  Reserved. Staging is "pnpm stage:android" today; the
                          helper does not submit builds yet.
  --token <value>         Pairing token. A fresh one is generated otherwise.
`);
        process.exit(0);
    }
  }

  return options;
}

function makeBuilder(options: Options): Builder {
  return options.builder === 'eas' ? new EasBuilder() : new FakeBuilder({ stepMs: 400 });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const builder = makeBuilder(options);

  const server = new BuildHelperServer({
    port: options.port,
    token: options.token,
    allowedOrigins: options.allowedOrigins.length > 0 ? options.allowedOrigins : undefined,
    workDirectory: options.workDirectory,
    builder,
    logger: (line) => console.log(line),
  });

  const port = await server.start();
  const readiness = server.builderStatus;
  if (readiness && !readiness.ready) {
    console.warn(`! The ${builder.name} builder is not ready: ${readiness.reason}`);
  }
  console.log(`Build helper listening on http://127.0.0.1:${port}`);
  console.log(`Builder: ${builder.name}`);
  console.log(`Work directory: ${options.workDirectory}`);
  console.log(`Pairing token: ${server.token}`);

  const stop = () => {
    void server.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

void main();
