import { createRoot } from 'react-dom/client';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { getTeamToken } from './lib/team-auth';

import App from './App';

import './index.css';

// Attach the team-session JWT to every generated API client request.
// The customFetch mutator skips this when no token is stored (unauthenticated).
setAuthTokenGetter(getTeamToken);

createRoot(document.getElementById('root')!).render(<App />);
