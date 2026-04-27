import { createServer } from 'node:http';
import { exec } from 'node:child_process';

const CLIENT_ID = process.env.CHROME_CLIENT_ID;
const CLIENT_SECRET = process.env.CHROME_CLIENT_SECRET;
const PORT = 8888;
const REDIRECT = `http://127.0.0.1:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Faltam variáveis de ambiente.');
  console.error('Uso:');
  console.error('  CHROME_CLIENT_ID="..." CHROME_CLIENT_SECRET="..." pnpm auth:chrome');
  process.exit(1);
}

const authUrl =
  'https://accounts.google.com/o/oauth2/auth' +
  '?response_type=code' +
  '&access_type=offline' +
  '&prompt=consent' +
  `&client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
  `&scope=${encodeURIComponent(SCOPE)}`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', REDIRECT);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Erro do Google: ${error}`);
    console.error(`\nErro do Google: ${error}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(404);
    res.end();
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>Pronto! Volte para o terminal.</h1>');

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  });

  const data = (await tokenResp.json()) as {
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenResp.ok || !data.refresh_token) {
    console.error('\nFalha ao trocar code por refresh_token:');
    console.error(JSON.stringify(data, null, 2));
    server.close();
    process.exit(1);
  }

  console.log('\n=========================================');
  console.log('CHROME_REFRESH_TOKEN');
  console.log('=========================================');
  console.log(data.refresh_token);
  console.log('=========================================\n');
  console.log('Cole o valor acima em:');
  console.log('GitHub → Settings → Secrets and variables → Actions');
  console.log('  → New repository secret');
  console.log('  Name:  CHROME_REFRESH_TOKEN');
  console.log('  Value: <valor acima>\n');

  server.close();
  process.exit(0);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nAguardando autorização em ${REDIRECT}...`);
  console.log('\nAbrindo o browser. Se não abrir, cole essa URL manualmente:\n');
  console.log(authUrl);
  console.log('');
  console.log('Importante: faça login com a conta Google que é dona da extensão na Chrome Web Store.\n');

  const opener =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start' :
    'xdg-open';
  exec(`${opener} "${authUrl}"`);
});
