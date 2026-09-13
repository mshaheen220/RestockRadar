export default function VersionBadge() {
  return (
    <span
      className="text-xs text-stone-400 dark:text-stone-500 font-mono"
      aria-label={`App version ${__APP_VERSION__}`}
    >
      v{__APP_VERSION__}
    </span>
  );
}
