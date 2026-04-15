import { useState } from 'react';
import { Input, Tooltip } from '@fluentui/react-components';
import { Copy16Regular, Checkmark16Regular } from '@fluentui/react-icons';

/**
 * One-time share link surface. Renders the link inside a Fluent `Input`
 * readOnly control — same boxed background + border + size as the Records
 * center searchBar (`ks-search`) so the two feel like the same family.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │ 📋  https://mock-keeper.local/ots/...........│
 *   └──────────────────────────────────────────────┘
 *
 * Copy icon on the FAR LEFT as `contentBefore` — clicking it copies the full
 * link to the clipboard and the icon briefly flips to a checkmark. The input
 * itself is select-all on focus so keyboard-copy (Cmd/Ctrl+C) still works.
 */
export function ShareLinkBlock({
  value,
  label = 'One-time share link',
  showLabel = true,
  className = '',
}: {
  value: string;
  label?: string;
  showLabel?: boolean;
  className?: string;
}): JSX.Element {
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent): Promise<void> {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (e.g. insecure context) — silently ignore */
    }
  }

  const CopyTrigger = (
    <Tooltip content={copied ? 'Copied' : 'Copy link'} relationship="label" positioning="above">
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Link copied' : 'Copy link'}
        className="
          inline-flex items-center justify-center w-5 h-5 rounded
          text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]
          transition-colors shrink-0
        "
      >
        {copied ? <Checkmark16Regular /> : <Copy16Regular />}
      </button>
    </Tooltip>
  );

  return (
    <div className={className}>
      {showLabel && (
        <div className="text-[12px] text-[var(--text-muted)] mb-1">{label}</div>
      )}
      <Input
        readOnly
        value={value}
        contentBefore={CopyTrigger}
        onFocus={(e) => e.currentTarget.select()}
        className="!w-full ks-search ks-mono"
        aria-label={label}
        size="small"
      />
    </div>
  );
}
