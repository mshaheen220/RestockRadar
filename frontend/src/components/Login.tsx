import { useState } from 'react';
import { Radar } from 'lucide-react';
import { useAuth } from '../AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSigningIn(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-6"
      >
        <div className="flex items-center gap-2 justify-center mb-4">
          <span className="flex items-center justify-center w-8 h-8 rounded-md bg-brand-500 text-white" aria-hidden="true">
            <Radar size={18} strokeWidth={2.25} />
          </span>
          <h1 className="text-lg font-bold text-brand-700 dark:text-brand-400">RestockRadar</h1>
        </div>

        <label htmlFor="login-username" className="block text-xs text-stone-500 dark:text-stone-400">
          Username
        </label>
        <input
          id="login-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          required
          className="w-full mb-3 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1.5 text-sm"
        />

        <label htmlFor="login-password" className="block text-xs text-stone-500 dark:text-stone-400">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full mb-4 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1.5 text-sm"
        />

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <button
          type="submit"
          disabled={signingIn}
          className="w-full rounded bg-brand-500 hover:bg-brand-600 text-white text-sm px-3 py-2 disabled:opacity-40"
        >
          {signingIn ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
